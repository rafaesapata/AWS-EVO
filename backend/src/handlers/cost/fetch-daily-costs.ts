/**
 * Lambda handler for Fetch Daily Costs
 * AWS Lambda Handler for fetch-daily-costs
 * 
 * Busca custos diários da AWS usando Cost Explorer API
 * Suporta busca incremental - busca apenas datas que ainda não estão no banco
 * 
 * DEMO MODE: Suporta modo demonstração para organizações com demo_mode=true
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logger.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { fetchDailyCostsSchema, type FetchDailyCostsInput } from '../../lib/schemas.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { isOrganizationInDemoMode, generateDemoCostData } from '../../lib/demo-data-service.js';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { cacheManager } from '../../lib/redis-cache.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  logger.info('Fetch Daily Costs started', { requestId: context.awsRequestId });
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const prisma = getPrismaClient();
    
    // Check for Demo Mode (FAIL-SAFE: returns false on any error)
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    
    if (isDemo === true) {
      // Return demo data for organizations in demo mode
      logger.info('Returning demo daily costs', {
        organizationId,
        isDemo: true,
        requestId: context.awsRequestId
      });
      
      const demoCosts = generateDemoCostData(30);
      const totalCost = demoCosts.reduce((sum, c) => sum + c.cost, 0);
      
      return success({
        success: true,
        _isDemo: true,
        data: {
          dailyCosts: demoCosts,
        },
        costs: demoCosts,
        summary: {
          totalCost: parseFloat(totalCost.toFixed(2)),
          totalRecords: demoCosts.length,
          newRecords: 0,
          skippedDays: 0,
          dateRange: { start: getDateDaysAgo(30), end: getDateDaysAgo(0) },
          uniqueDates: 30,
          uniqueServices: 8,
          accounts: 1,
          accountsProcessed: [{ id: 'demo-account', name: 'Demo AWS Account' }],
          incremental: false,
        },
      });
    }
    
    // Validar input com Zod usando parseAndValidateBody
    const parseResult = parseAndValidateBody(fetchDailyCostsSchema, event.body);
    
    if (!parseResult.success) {
      return parseResult.error;
    }
    
    const { 
      accountId, 
      startDate: requestedStartDate, 
      endDate = getDateDaysAgo(0),
      granularity = 'DAILY',
      incremental = true, // Nova opção: busca incremental por padrão
      services, // Filter by service names (from tag-cost-services)
    } = parseResult.data as any;
    
    // Check if accountId is an Azure credential
    if (accountId) {
      const azureCredential = await prisma.azureCredential.findFirst({
        where: {
          id: accountId,
          organization_id: organizationId,
          is_active: true,
        },
      });
      
      if (azureCredential) {
        // This is an Azure account - return data from database only
        // Azure costs are fetched via azure-fetch-costs Lambda
        logger.info('Fetching Azure costs from database', {
          organizationId,
          credentialId: accountId,
          subscriptionId: azureCredential.subscription_id,
        });
        
        const requestedStart = requestedStartDate || getDateDaysAgo(365);
        
        // Fetch Azure costs from database (use azure_credential_id, NOT aws_account_id)
        const azureCosts = await prisma.dailyCost.findMany({
          where: {
            organization_id: organizationId,
            azure_credential_id: accountId,
            cloud_provider: 'AZURE',
            date: {
              gte: new Date(requestedStart),
              lte: new Date(endDate),
            },
            ...(services && services.length > 0 && { service: { in: services } }),
          },
          orderBy: { date: 'desc' },
        });
        
        // Transform to expected format
        const costs = azureCosts.map(c => ({
          accountId: c.azure_credential_id || accountId,
          accountName: azureCredential.subscription_name || azureCredential.subscription_id,
          date: c.date.toISOString().split('T')[0],
          service: c.service || 'Unknown',
          cost: typeof c.cost === 'number' ? c.cost : parseFloat(String(c.cost)),
          currency: c.currency || 'USD',
          cloudProvider: 'AZURE',
        }));
        
        const totalCost = costs.reduce((sum, c) => sum + c.cost, 0);
        const uniqueDates = [...new Set(costs.map(c => c.date))].length;
        const uniqueServices = [...new Set(costs.map(c => c.service))].length;
        
        logger.info('Azure costs fetched from database', {
          organizationId,
          credentialId: accountId,
          recordCount: costs.length,
          uniqueDates,
          totalCost: parseFloat(totalCost.toFixed(2)),
        });
        
        return success({
          success: true,
          cloudProvider: 'AZURE',
          data: {
            dailyCosts: costs,
          },
          costs: costs,
          summary: {
            totalCost: parseFloat(totalCost.toFixed(2)),
            totalRecords: costs.length,
            newRecords: 0,
            skippedDays: 0,
            dateRange: { start: requestedStart, end: endDate },
            uniqueDates,
            uniqueServices,
            accounts: 1,
            accountsProcessed: [{ 
              id: accountId, 
              name: azureCredential.subscription_name || azureCredential.subscription_id,
              cloudProvider: 'AZURE',
            }],
            incremental: false,
          },
        });
      }
    }
    
    // AWS Cost Explorer limita dados históricos a 14 meses
    const maxHistoricalDate = getDateDaysAgo(420); // ~14 meses
    
    // Buscar credenciais AWS ativas
    const awsAccounts = await prisma.awsCredential.findMany({
      where: {
        organization_id: organizationId,
        is_active: true,
        ...(accountId && { id: accountId }),
      },
    });
    
    if (awsAccounts.length === 0) {
      return success({
        success: true,
        message: 'No AWS credentials configured',
        costs: [],
        summary: { totalRecords: 0, newRecords: 0, skippedDays: 0 }
      });
    }
    
    const allCosts: any[] = [];
    let totalNewRecords = 0;
    let totalSkippedDays = 0;

    // SWR Cache - skip expensive Cost Explorer API calls if data is fresh
    // Normalize dates to day boundaries to maximize cache hits across multiple frontend calls
    const requestedStart = requestedStartDate || getDateDaysAgo(365);
    const normalizedStart = requestedStart.split('T')[0]; // strip time component
    const normalizedEnd = endDate.split('T')[0];
    const normalizedAccountId = accountId || 'all';
    const normalizedServices = services && services.length > 0 ? services.sort().join(',') : '';
    const cacheKey = `daily:${organizationId}:${normalizedAccountId}:${normalizedStart}:${normalizedEnd}:${granularity}:${normalizedServices}`;
    const cached = await cacheManager.getSWR<any>(cacheKey, { prefix: 'cost' });
    if (cached && !cached.stale) {
      logger.info('Daily costs cache hit (fresh)', { organizationId });
      return success({ ...cached.data, _fromCache: true });
    }
    
    // Processar cada conta AWS
    for (const account of awsAccounts) {
      try {
        logger.info('Processing account', { 
          accountId: account.id, 
          accountName: account.account_name,
          incremental
        });
        
        // Determinar data de início baseado nos dados existentes
        let startDate = requestedStartDate || getDateDaysAgo(365); // Default: 1 ano
        
        // Garantir que não ultrapasse o limite de 14 meses da AWS
        if (startDate < maxHistoricalDate) {
          startDate = maxHistoricalDate;
          logger.info('Adjusted start date to AWS limit', { 
            accountId: account.id,
            requestedStart: requestedStartDate,
            adjustedStart: startDate,
            reason: '14-month historical data limit'
          });
        }
        
        if (incremental) {
          // Buscar a data mais recente no banco para esta conta
          const latestCost = await prisma.dailyCost.findFirst({
            where: {
              organization_id: organizationId,
              aws_account_id: account.id,
            },
            orderBy: { date: 'desc' },
            select: { date: true }
          });
          
          if (latestCost?.date) {
            // Começar do dia seguinte ao último registro
            const lastDate = new Date(latestCost.date);
            lastDate.setDate(lastDate.getDate() + 1);
            const incrementalStart = lastDate.toISOString().split('T')[0];
            
            // Usar a data mais recente entre a solicitada e a incremental
            if (incrementalStart > startDate) {
              const skippedDays = Math.floor((new Date(incrementalStart).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
              totalSkippedDays += skippedDays;
              startDate = incrementalStart;
              logger.info('Using incremental start date', { 
                accountId: account.id,
                lastDateInDb: latestCost.date,
                incrementalStart,
                skippedDays
              });
            }
          }
        }
        
        // Se a data de início é maior ou igual à data de fim, não há nada para buscar
        if (startDate >= endDate) {
          logger.info('No new dates to fetch for account', { 
            accountId: account.id,
            startDate,
            endDate
          });
          continue;
        }
        
        const resolvedCreds = await resolveAwsCredentials(account, 'us-east-1');
        
        const ceClient = new CostExplorerClient({
          region: 'us-east-1', // Cost Explorer sempre usa us-east-1
          credentials: toAwsCredentials(resolvedCreds),
        });
        
        logger.info('Calling Cost Explorer API', { 
          accountId: account.id,
          startDate,
          endDate,
          granularity
        });
        
        const command = new GetCostAndUsageCommand({
          TimePeriod: {
            Start: startDate,
            End: endDate,
          },
          Granularity: granularity,
          Metrics: ['UnblendedCost', 'UsageQuantity'],
          GroupBy: [
            {
              Type: 'DIMENSION',
              Key: 'SERVICE',
            },
          ],
          // CRITICAL FIX: Filter by linked account to avoid duplicate costs
          // When using a payer account, Cost Explorer returns costs for ALL linked accounts
          // We need to filter to get only the costs for this specific account
          ...(account.account_id && {
            Filter: {
              Dimensions: {
                Key: 'LINKED_ACCOUNT',
                Values: [account.account_id],
              },
            },
          }),
        });
        
        const response = await ceClient.send(command);
        
        logger.info('Cost Explorer response', { 
          accountId: account.id,
          resultsByTimeCount: response.ResultsByTime?.length || 0
        });
        
        // Processar resultados - agregar por dia
        if (response.ResultsByTime) {
          for (const result of response.ResultsByTime) {
            const date = result.TimePeriod?.Start;
            if (!date) continue;
            
            // Agregar custos por serviço para este dia
            const serviceBreakdown: Record<string, number> = {};
            let dailyTotal = 0;
            
            if (result.Groups) {
              for (const group of result.Groups) {
                const service = group.Keys?.[0] || 'Unknown';
                const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
                
                if (cost > 0) {
                  serviceBreakdown[service] = cost;
                  dailyTotal += cost;
                  
                  allCosts.push({
                    accountId: account.id,
                    accountName: account.account_name,
                    date,
                    service,
                    cost,
                    currency: group.Metrics?.UnblendedCost?.Unit || 'USD',
                  });
                }
              }
            }
            
            // Salvar custos por serviço no banco (um registro por serviço/dia)
            // Batch upsert costs by service for this day
            // Uses raw SQL upsert to avoid race conditions from concurrent Lambda invocations
            // (the previous find-then-create pattern could create duplicates under concurrency)
            for (const [service, cost] of Object.entries(serviceBreakdown)) {
              if (cost > 0) {
                try {
                  await prisma.$executeRaw`
                    INSERT INTO daily_costs (id, organization_id, aws_account_id, date, service, cost, currency, created_at)
                    VALUES (gen_random_uuid(), ${organizationId}::uuid, ${account.id}::uuid, ${new Date(date)}, ${service}, ${cost}::decimal, 'USD', NOW())
                    ON CONFLICT (organization_id, aws_account_id, date, service)
                    DO UPDATE SET cost = ${cost}::decimal, created_at = NOW()
                  `;
                  totalNewRecords++;
                } catch (dbErr) {
                  // Fallback: try Prisma create with skipDuplicates if raw SQL fails
                  // (e.g., if the unique constraint doesn't exist yet)
                  try {
                    await prisma.dailyCost.create({
                      data: {
                        organization_id: organizationId,
                        aws_account_id: account.id,
                        date: new Date(date),
                        service: service,
                        cost: cost,
                        currency: 'USD',
                      }
                    });
                    totalNewRecords++;
                  } catch (fallbackErr) {
                    logger.warn('Failed to save daily cost', { date, service, error: (fallbackErr as Error).message });
                  }
                }
              }
            }
          }
        }
        
        logger.info('Fetched costs for account', { 
          accountId: account.id, 
          accountName: account.account_name,
          costsFound: allCosts.filter(c => c.accountId === account.id).length
        });
        
      } catch (err: any) {
        logger.error('Error fetching costs for account', err as Error, { 
          accountId: account.id,
          errorName: err?.name,
          errorMessage: err?.message,
          errorCode: err?.Code || err?.$metadata?.httpStatusCode
        });
      }
    }
    
    // IMPORTANT: Always return existing data from database, not just newly fetched data
    // This ensures the frontend always has data to display

    // Fetch all existing costs from database for the requested period
    const existingCosts = await prisma.dailyCost.findMany({
      where: {
        organization_id: organizationId,
        ...(accountId && { aws_account_id: accountId }),
        date: {
          gte: new Date(requestedStart),
          lte: new Date(endDate),
        },
        ...(services && services.length > 0 && { service: { in: services } }),
      },
      orderBy: { date: 'desc' },
    });
    
    // Transform database records to the expected format
    const dbCosts = existingCosts.map(c => ({
      accountId: c.aws_account_id,
      accountName: awsAccounts.find(a => a.id === c.aws_account_id)?.account_name || c.aws_account_id,
      date: c.date.toISOString().split('T')[0],
      service: c.service,
      cost: typeof c.cost === 'number' ? c.cost : parseFloat(String(c.cost)),
      currency: c.currency || 'USD',
    }));
    
    // Calcular totais from database (not just newly fetched)
    const totalCost = dbCosts.reduce((sum, c) => sum + c.cost, 0);
    const uniqueDates = [...new Set(dbCosts.map(c => c.date))].length;
    const uniqueServices = [...new Set(dbCosts.map(c => c.service))].length;
    
    logger.info('Daily costs fetch completed', { 
      recordsCount: dbCosts.length,
      newRecords: totalNewRecords,
      skippedDays: totalSkippedDays,
      totalCost: parseFloat(totalCost.toFixed(2)) 
    });
    
    const responseData = {
      success: true,
      data: {
        dailyCosts: dbCosts,
      },
      costs: dbCosts,
      summary: {
        totalCost: parseFloat(totalCost.toFixed(2)),
        totalRecords: dbCosts.length,
        newRecords: totalNewRecords,
        skippedDays: totalSkippedDays,
        dateRange: { start: requestedStart, end: endDate },
        uniqueDates,
        uniqueServices,
        accounts: awsAccounts.length,
        accountsProcessed: awsAccounts.map(a => ({ id: a.id, name: a.account_name })),
        incremental,
      },
    };

    // Save to SWR cache (freshFor: 300s = 5min, maxTTL: 24h)
    await cacheManager.setSWR(cacheKey, responseData, { prefix: 'cost', freshFor: 300, maxTTL: 86400 });

    return success(responseData);
    
  } catch (err) {
    logger.error('Fetch Daily Costs error', err as Error, { requestId: context.awsRequestId });
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}
