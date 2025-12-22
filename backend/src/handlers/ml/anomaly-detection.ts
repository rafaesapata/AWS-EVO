/**
 * Lambda handler for Anomaly Detection
 * AWS Lambda Handler for anomaly-detection
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Anomaly Detection started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const prisma = getPrismaClient();
    
    const anomalies: any[] = [];
    
    // Detectar anomalias de custo
    const costAnomalies = await detectCostAnomalies(prisma, organizationId);
    anomalies.push(...costAnomalies);
    
    // Detectar anomalias de segurança
    const securityAnomalies = await detectSecurityAnomalies(prisma, organizationId);
    anomalies.push(...securityAnomalies);
    
    // Detectar anomalias de performance
    const performanceAnomalies = await detectPerformanceAnomalies(prisma, organizationId);
    anomalies.push(...performanceAnomalies);
    
    logger.info(`✅ Detected ${anomalies.length} anomalies`);
    
    return success({
      success: true,
      anomalies,
      summary: {
        total: anomalies.length,
        cost: costAnomalies.length,
        security: securityAnomalies.length,
        performance: performanceAnomalies.length,
      },
    });
    
  } catch (err) {
    logger.error('❌ Anomaly Detection error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

async function detectCostAnomalies(prisma: any, organizationId: string) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const costs = await prisma.dailyCost.groupBy({
    by: ['date'],
    where: { organizationId, date: { gte: sevenDaysAgo } },
    _sum: { cost: true },
  });
  
  const anomalies = [];
  const values = costs.map((c: any) => c._sum.cost || 0);
  const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((sum: number, val: number) => sum + Math.pow(val - avg, 2), 0) / values.length);
  
  for (let i = 0; i < costs.length; i++) {
    const cost = costs[i]._sum.cost || 0;
    if (cost > avg + (2 * stdDev)) {
      anomalies.push({
        type: 'cost',
        severity: 'high',
        date: costs[i].date,
        value: cost,
        expected: avg,
        deviation: ((cost - avg) / avg * 100).toFixed(1) + '%',
      });
    }
  }
  
  return anomalies;
}

async function detectSecurityAnomalies(prisma: any, organizationId: string) {
  return [];
}

async function detectPerformanceAnomalies(prisma: any, organizationId: string) {
  return [];
}
