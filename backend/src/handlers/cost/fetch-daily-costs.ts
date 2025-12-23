/**
 * Lambda handler for Fetch Daily Costs
 * AWS Lambda Handler for fetch-daily-costs
 * 
 * Busca custos diários da AWS usando Cost Explorer API
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod } from '../../lib/http-helpers.js';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';

interface FetchDailyCostsRequest {
  accountId?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  granularity?: 'DAILY' | 'MONTHLY';
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('Fetch Daily Costs started', { requestId: context.awsRequestId });
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: FetchDailyCostsRequest = event.body ? JSON.parse(event.body) : {};
    const { 
      accountId, 
      startDate = getDateDaysAgo(30), 
      endDate = getDateDaysAgo(0),
      granularity = 'DAILY'
    } = body;
    
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
      });
    }
    
    const allCosts: any[] = [];
    
    // Processar cada conta AWS
    for (const account of awsAccounts) {
      try {
        const resolvedCreds = await resolveAwsCredentials(account, 'us-east-1');
        
        const ceClient = new CostExplorerClient({
          region: 'us-east-1', // Cost Explorer sempre usa us-east-1
          credentials: toAwsCredentials(resolvedCreds),
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
        
        // Processar resultados
        if (response.ResultsByTime) {
          for (const result of response.ResultsByTime) {
            const date = result.TimePeriod?.Start;
            
            if (result.Groups) {
              for (const group of result.Groups) {
                const service = group.Keys?.[0] || 'Unknown';
                const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
                const usage = parseFloat(group.Metrics?.UsageQuantity?.Amount || '0');
                
                allCosts.push({
                  accountId: account.id,
                  accountName: account.account_name,
                  date,
                  service,
                  cost,
                  usage,
                  currency: group.Metrics?.UnblendedCost?.Unit || 'USD',
                });
                
                // Salvar no banco
                await prisma.dailyCost.upsert({
                  where: {
                    account_id_date_service: {
                      account_id: account.id,
                      date: new Date(date!),
                      service,
                    },
                  },
                  update: {
                    cost,
                    usage,
                  },
                  create: {
                    organization_id: organizationId,
                    account_id: account.id,
                    date: new Date(date!),
                    service,
                    cost,
                    usage,
                    currency: 'USD'
                  },
                });
              }
            }
          }
        }
        
        logger.info('Fetched costs for account', { accountId: account.id, accountName: account.account_name });
        
      } catch (err) {
        logger.error('Error fetching costs for account', err as Error, { accountId: account.id });
      }
    }
    
    // Calcular totais
    const totalCost = allCosts.reduce((sum, c) => sum + c.cost, 0);
    const uniqueDates = [...new Set(allCosts.map(c => c.date))].length;
    const uniqueServices = [...new Set(allCosts.map(c => c.service))].length;
    
    logger.info('Daily costs fetch completed', { 
      recordsCount: allCosts.length, 
      totalCost: parseFloat(totalCost.toFixed(2)) 
    });
    
    return success({
      success: true,
      costs: allCosts,
      summary: {
        totalCost: parseFloat(totalCost.toFixed(2)),
        totalRecords: allCosts.length,
        dateRange: { start: startDate, end: endDate },
        uniqueDates,
        uniqueServices,
        accounts: awsAccounts.length,
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
