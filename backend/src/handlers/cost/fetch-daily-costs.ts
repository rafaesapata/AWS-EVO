/**
 * Lambda handler for Fetch Daily Costs
 * AWS Lambda Handler for fetch-daily-costs
 * 
 * Busca custos diários da AWS usando Cost Explorer API
 * Suporta busca incremental - busca apenas datas que ainda não estão no banco
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { fetchDailyCostsSchema, type FetchDailyCostsInput } from '../../lib/schemas.js';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';

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
    const organizationId = getOrganizationId(user);
    
    // Validar input com Zod
    const parseResult = fetchDailyCostsSchema.safeParse(
      event.body ? JSON.parse(event.body) : {}
    );
    
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      return badRequest(`Validation error: ${errorMessages}`, undefined, origin);
    }
    
    const { 
      accountId, 
      startDate: requestedStartDate, 
      endDate = getDateDaysAgo(0),
      granularity = 'DAILY',
      incremental = true // Nova opção: busca incremental por padrão
    } = parseResult.data as any;
    
    const prisma = getPrismaClient();
    
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
            for (const [service, cost] of Object.entries(serviceBreakdown)) {
              if (cost > 0) {
                try {
                  // Check if record exists first
                  const existing = await prisma.dailyCost.findFirst({
                    where: {
                      organization_id: organizationId,
                      aws_account_id: account.id,
                      date: new Date(date),
                      service: service,
                    }
                  });
                  
                  if (existing) {
                    // Update existing record
                    await prisma.dailyCost.update({
                      where: { id: existing.id },
                      data: { cost: cost, created_at: new Date() }
                    });
                  } else {
                    // Create new record
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
                  }
                  totalNewRecords++;
                } catch (dbErr) {
                  logger.warn('Failed to save daily cost', { date, service, error: dbErr });
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
    
    // Calcular totais
    const totalCost = allCosts.reduce((sum, c) => sum + c.cost, 0);
    const uniqueDates = [...new Set(allCosts.map(c => c.date))].length;
    const uniqueServices = [...new Set(allCosts.map(c => c.service))].length;
    
    logger.info('Daily costs fetch completed', { 
      recordsCount: allCosts.length,
      newRecords: totalNewRecords,
      skippedDays: totalSkippedDays,
      totalCost: parseFloat(totalCost.toFixed(2)) 
    });
    
    return success({
      success: true,
      data: {
        dailyCosts: allCosts,
      },
      costs: allCosts,
      summary: {
        totalCost: parseFloat(totalCost.toFixed(2)),
        totalRecords: allCosts.length,
        newRecords: totalNewRecords,
        skippedDays: totalSkippedDays,
        dateRange: { start: requestedStartDate || getDateDaysAgo(365), end: endDate },
        uniqueDates,
        uniqueServices,
        accounts: awsAccounts.length,
        accountsProcessed: awsAccounts.map(a => ({ id: a.id, name: a.account_name })),
        incremental,
      },
    });
    
  } catch (err) {
    logger.error('Fetch Daily Costs error', err as Error, { requestId: context.awsRequestId });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}
