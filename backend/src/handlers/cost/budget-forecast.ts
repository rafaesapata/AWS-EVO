/**
 * Lambda handler para previsão de orçamento
 * AWS Lambda Handler for budget-forecast
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { CostExplorerClient, GetCostForecastCommand, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';

interface BudgetForecastRequest {
  accountId?: string;
  months?: number;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('📊 Budget forecast started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: BudgetForecastRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, months = 3 } = body;
    
    const prisma = getPrismaClient();
    
    const credential = await prisma.awsCredential.findFirst({
      where: {
        organization_id: organizationId,
        is_active: true,
        ...(accountId && { id: accountId }),
      },
      orderBy: { created_at: 'desc' },
    });
    
    if (!credential) {
      return badRequest('AWS credentials not found');
    }
    
    const creds = await resolveAwsCredentials(credential, 'us-east-1');
    const costExplorerClient = new CostExplorerClient({
      region: 'us-east-1',
      credentials: toAwsCredentials(creds),
    });
    
    // Obter custos históricos (últimos 3 meses)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);
    
    const historicalResponse = await costExplorerClient.send(
      new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startDate.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
      })
    );
    
    // Calcular custos históricos
    const historicalCosts = historicalResponse.ResultsByTime?.map(result => ({
      month: result.TimePeriod?.Start,
      cost: parseFloat(result.Total?.UnblendedCost?.Amount || '0'),
    })) || [];
    
    // Obter previsão da AWS
    const forecastStartDate = new Date();
    const forecastEndDate = new Date();
    forecastEndDate.setMonth(forecastEndDate.getMonth() + months);
    
    const forecastResponse = await costExplorerClient.send(
      new GetCostForecastCommand({
        TimePeriod: {
          Start: forecastStartDate.toISOString().split('T')[0],
          End: forecastEndDate.toISOString().split('T')[0],
        },
        Metric: 'UNBLENDED_COST',
        Granularity: 'MONTHLY',
      })
    );
    
    const forecastTotal = parseFloat(forecastResponse.Total?.Amount || '0');
    const forecastMonthly = forecastTotal / months;
    
    // Calcular tendência
    const avgHistorical = historicalCosts.reduce((sum, c) => sum + c.cost, 0) / historicalCosts.length;
    const trend = ((forecastMonthly - avgHistorical) / avgHistorical) * 100;
    
    // Gerar alertas
    const alerts = [];
    
    if (trend > 20) {
      alerts.push({
        type: 'warning',
        message: `Custo previsto ${trend.toFixed(1)}% maior que a média histórica`,
        severity: 'high',
      });
    }
    
    if (forecastMonthly > avgHistorical * 1.5) {
      alerts.push({
        type: 'critical',
        message: 'Custo previsto 50% acima da média - revisar recursos',
        severity: 'critical',
      });
    }
    
    logger.info(`✅ Forecast completed: $${forecastMonthly.toFixed(2)}/month`);
    
    return success({
      historical: {
        months: historicalCosts,
        average: parseFloat(avgHistorical.toFixed(2)),
        total: parseFloat(historicalCosts.reduce((sum, c) => sum + c.cost, 0).toFixed(2)),
      },
      forecast: {
        months_ahead: months,
        monthly_average: parseFloat(forecastMonthly.toFixed(2)),
        total: parseFloat(forecastTotal.toFixed(2)),
        trend_percentage: parseFloat(trend.toFixed(2)),
      },
      alerts,
      recommendations: generateRecommendations(trend, forecastMonthly, avgHistorical),
    });
    
  } catch (err) {
    logger.error('❌ Budget forecast error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

function generateRecommendations(trend: number, forecast: number, historical: number): string[] {
  const recommendations = [];
  
  if (trend > 20) {
    recommendations.push('Revisar recursos criados recentemente');
    recommendations.push('Verificar instâncias EC2 e RDS ociosas');
    recommendations.push('Considerar Reserved Instances para reduzir custos');
  }
  
  if (trend > 50) {
    recommendations.push('URGENTE: Investigar aumento significativo de custos');
    recommendations.push('Verificar possível uso não autorizado de recursos');
  }
  
  if (forecast > 1000) {
    recommendations.push('Considerar Savings Plans para economia de longo prazo');
    recommendations.push('Implementar políticas de auto-scaling');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Custos estáveis - continuar monitoramento regular');
  }
  
  return recommendations;
}
