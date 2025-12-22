/**
 * Lambda handler for Predict Incidents
 * AWS Lambda Handler for predict-incidents
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
  logger.info('🚀 Predict Incidents started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const prisma = getPrismaClient();
    
    // Analisar histórico de incidentes
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const historicalAlerts = await prisma.alert.findMany({
      where: {
        organization_id: organizationId,
        triggered_at: { gte: thirtyDaysAgo },
      },
      orderBy: { triggered_at: 'desc' },
    });
    
    // Analisar findings críticos
    const criticalFindings = await prisma.finding.count({
      where: {
        organization_id: organizationId,
        severity: 'critical',
        status: 'pending',
      },
    });
    
    // Analisar drifts recentes
    const recentDrifts = await prisma.driftDetection.count({
      where: {
        organization_id: organizationId,
        detected_at: { gte: thirtyDaysAgo },
        severity: { in: ['critical', 'high'] },
      },
    });
    
    // Analisar tendência de custos
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentCosts = await prisma.dailyCost.groupBy({
      by: ['date'],
      where: {
        organization_id: organizationId,
        date: { gte: sevenDaysAgo },
      },
      _sum: { cost: true },
      orderBy: { date: 'asc' },
    });
    
    // Calcular score de risco
    const predictions: any[] = [];
    
    // Predição 1: Incidente de segurança
    if (criticalFindings > 5) {
      predictions.push({
        type: 'security_incident',
        probability: Math.min(95, 60 + (criticalFindings * 5)),
        severity: 'critical',
        timeframe: '24-48 hours',
        description: `High probability of security incident due to ${criticalFindings} critical findings`,
        recommendation: 'Immediate remediation of critical findings required',
        indicators: {
          criticalFindings,
          trend: 'increasing',
        },
      });
    }
    
    // Predição 2: Drift crítico
    if (recentDrifts > 10) {
      predictions.push({
        type: 'configuration_drift',
        probability: Math.min(90, 50 + (recentDrifts * 3)),
        severity: 'high',
        timeframe: '1-3 days',
        description: `Configuration drift detected in ${recentDrifts} resources`,
        recommendation: 'Review and remediate configuration drifts',
        indicators: {
          driftsCount: recentDrifts,
          trend: 'increasing',
        },
      });
    }
    
    // Predição 3: Spike de custos
    if (recentCosts.length >= 2) {
      const costs = recentCosts.map(c => c._sum?.cost || 0);
      const lastCost = costs[costs.length - 1];
      const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;
      
      if (lastCost > avgCost * 1.5) {
        predictions.push({
          type: 'cost_spike',
          probability: 75,
          severity: 'medium',
          timeframe: '1-2 days',
          description: `Cost spike detected: current $${lastCost.toFixed(2)} vs avg $${avgCost.toFixed(2)}`,
          recommendation: 'Investigate cost anomaly and optimize resources',
          indicators: {
            currentCost: lastCost,
            avgCost,
            increase: ((lastCost - avgCost) / avgCost * 100).toFixed(1) + '%',
          },
        });
      }
    }
    
    // Predição 4: Alerta de disponibilidade
    const failedEndpoints = await prisma.endpointCheckHistory.count({
      where: {
        status: 'down',
        checked_at: { gte: thirtyDaysAgo },
      },
    });
    
    if (failedEndpoints > 5) {
      predictions.push({
        type: 'availability_issue',
        probability: 65,
        severity: 'high',
        timeframe: '12-24 hours',
        description: `${failedEndpoints} endpoint failures detected in last 30 days`,
        recommendation: 'Review endpoint health and implement redundancy',
        indicators: {
          failedChecks: failedEndpoints,
          trend: 'concerning',
        },
      });
    }
    
    // Ordenar por probabilidade
    predictions.sort((a, b) => b.probability - a.probability);
    
    logger.info(`✅ Generated ${predictions.length} incident predictions`);
    
    return success({
      success: true,
      predictions,
      summary: {
        total: predictions.length,
        critical: predictions.filter(p => p.severity === 'critical').length,
        high: predictions.filter(p => p.severity === 'high').length,
        medium: predictions.filter(p => p.severity === 'medium').length,
      },
      analyzedData: {
        alerts: historicalAlerts.length,
        criticalFindings,
        recentDrifts,
        costDataPoints: recentCosts.length,
      },
    });
    
  } catch (err) {
    logger.error('❌ Predict Incidents error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
