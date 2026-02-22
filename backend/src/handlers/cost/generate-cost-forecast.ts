import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Generate Cost Forecast
 * AWS Lambda Handler for generate-cost-forecast
 * 
 * Gera previsão de custos baseada em dados históricos
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { isOrganizationInDemoMode } from '../../lib/demo-data-service.js';
import { applyOverhead, type OverheadFieldConfig } from '../../lib/cost-overhead.js';

const COST_FORECAST_OVERHEAD_FIELDS: OverheadFieldConfig[] = [
  { path: 'forecast', type: 'array', fields: ['predictedCost', 'lowerBound', 'upperBound'] },
  { path: 'summary', type: 'object', fields: ['totalPredicted', 'avgDailyCost', 'avgHistoricalCost'] },
];

interface GenerateCostForecastRequest {
  accountId?: string;
  forecastDays?: number; // Dias para prever (default: 30)
}

interface ForecastDataPoint {
  date: string;
  predictedCost: number;
  confidence: number; // 0-100
  lowerBound: number;
  upperBound: number;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Generate Cost Forecast started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const body: GenerateCostForecastRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, forecastDays = 30 } = body;
    
    const prisma = getPrismaClient();
    
    // Check if organization is in demo mode (FAIL-SAFE: returns false on any error)
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    if (isDemo === true) {
      logger.info('🎭 Returning demo cost forecast data', { organizationId });
      const demoWithOverhead = await applyOverhead(organizationId, generateDemoCostForecast(forecastDays), COST_FORECAST_OVERHEAD_FIELDS);
      return success(demoWithOverhead);
    }
    
    // Buscar custos históricos dos últimos 90 dias
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const historicalCosts = await prisma.dailyCost.groupBy({
      by: ['date'],
      where: {
        organization_id: organizationId,
        ...(accountId && { aws_account_id: accountId }),
        date: {
          gte: ninetyDaysAgo,
        },
      },
      _sum: {
        cost: true,
      },
      orderBy: {
        date: 'asc',
      },
    });
    
    if (historicalCosts.length < 7) {
      return error('Insufficient historical data. Need at least 7 days of cost data.', 400);
    }
    
    // Extrair valores de custo
    const costs = historicalCosts.map(c => Number(c._sum?.cost) || 0);
    
    // Calcular tendência usando regressão linear simples
    const n = costs.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = costs;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calcular desvio padrão para intervalos de confiança
    const predictions = x.map(xi => slope * xi + intercept);
    const residuals = y.map((yi, i) => yi - predictions[i]);
    const variance = residuals.reduce((sum, r) => sum + r * r, 0) / n;
    const stdDev = Math.sqrt(variance);
    
    // Gerar previsões
    const forecast: ForecastDataPoint[] = [];
    const today = new Date();
    
    for (let i = 1; i <= forecastDays; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + i);
      
      const x_future = n + i - 1;
      const predictedCost = slope * x_future + intercept;
      
      // Intervalo de confiança (95%)
      const margin = 1.96 * stdDev;
      
      forecast.push({
        date: futureDate.toISOString().split('T')[0],
        predictedCost: Math.max(0, predictedCost),
        confidence: Math.min(100, Math.max(0, 100 - (i * 2))), // Confiança diminui com o tempo
        lowerBound: Math.max(0, predictedCost - margin),
        upperBound: predictedCost + margin,
      });
    }
    
    // Calcular totais
    const totalPredicted = forecast.reduce((sum, f) => sum + f.predictedCost, 0);
    const avgDailyCost = totalPredicted / forecastDays;
    
    // Comparar com média histórica
    const avgHistoricalCost = costs.reduce((a, b) => a + b, 0) / costs.length;
    const trend = slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable';
    const trendPercentage = ((avgDailyCost - avgHistoricalCost) / avgHistoricalCost) * 100;
    
    logger.info(`✅ Generated ${forecastDays}-day forecast: $${totalPredicted.toFixed(2)} total`);
    
    const mainResponse = {
      success: true,
      forecast,
      summary: {
        forecastDays,
        totalPredicted: parseFloat(totalPredicted.toFixed(2)),
        avgDailyCost: parseFloat(avgDailyCost.toFixed(2)),
        avgHistoricalCost: parseFloat(avgHistoricalCost.toFixed(2)),
        trend,
        trendPercentage: parseFloat(trendPercentage.toFixed(2)),
        confidence: 'medium',
      },
      metadata: {
        historicalDays: costs.length,
        slope: parseFloat(slope.toFixed(4)),
        intercept: parseFloat(intercept.toFixed(2)),
        stdDev: parseFloat(stdDev.toFixed(2)),
      },
    };
    
    const responseWithOverhead = await applyOverhead(organizationId, mainResponse, COST_FORECAST_OVERHEAD_FIELDS);
    return success(responseWithOverhead);
    
  } catch (err) {
    logger.error('❌ Generate Cost Forecast error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

/**
 * Generate demo cost forecast data
 */
function generateDemoCostForecast(forecastDays: number = 30) {
  const today = new Date();
  const forecast: ForecastDataPoint[] = [];
  
  // Base cost with slight upward trend
  const baseCost = 125.50;
  const dailyIncrease = 0.8;
  const stdDev = 15.5;
  
  for (let i = 1; i <= forecastDays; i++) {
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + i);
    
    const predictedCost = baseCost + (dailyIncrease * i) + (Math.random() - 0.5) * 10;
    const margin = 1.96 * stdDev;
    
    forecast.push({
      date: futureDate.toISOString().split('T')[0],
      predictedCost: Math.max(0, parseFloat(predictedCost.toFixed(2))),
      confidence: Math.min(100, Math.max(0, 100 - (i * 2))),
      lowerBound: Math.max(0, parseFloat((predictedCost - margin).toFixed(2))),
      upperBound: parseFloat((predictedCost + margin).toFixed(2)),
    });
  }
  
  const totalPredicted = forecast.reduce((sum, f) => sum + f.predictedCost, 0);
  const avgDailyCost = totalPredicted / forecastDays;
  
  return {
    _isDemo: true,
    success: true,
    forecast,
    summary: {
      forecastDays,
      totalPredicted: parseFloat(totalPredicted.toFixed(2)),
      avgDailyCost: parseFloat(avgDailyCost.toFixed(2)),
      avgHistoricalCost: 118.42,
      trend: 'increasing' as const,
      trendPercentage: 8.5,
      confidence: 'medium',
    },
    metadata: {
      historicalDays: 90,
      slope: 0.8,
      intercept: 118.42,
      stdDev: 15.5,
    },
  };
}
