import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Intelligent Alerts Analyzer
 * AWS Lambda Handler for intelligent-alerts-analyzer
 * 
 * Analisa alertas usando IA para reduzir falsos positivos
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { isOrganizationInDemoMode, generateDemoIntelligentAlertsAnalysis } from '../../lib/demo-data-service.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Intelligent Alerts Analyzer started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const prisma = getPrismaClient();
    
    // Check if organization is in demo mode (FAIL-SAFE: returns false on any error)
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    if (isDemo === true) {
      logger.info('🎭 Returning demo intelligent alerts analysis', { organizationId });
      return success(generateDemoIntelligentAlertsAnalysis());
    }
    
    // Buscar alertas recentes não resolvidos
    const alerts = await prisma.alert.findMany({
      where: {
        organization_id: organizationId,
        resolved_at: null,
      },
      orderBy: { triggered_at: 'desc' },
      take: 50,
    });
    
    const analyzedAlerts = [];
    
    for (const alert of alerts) {
      const analysis = await analyzeAlert(prisma, alert);
      
      analyzedAlerts.push({
        alertId: alert.id,
        title: alert.title,
        severity: alert.severity,
        triggeredAt: alert.triggered_at,
        analysis: {
          isFalsePositive: analysis.isFalsePositive,
          confidence: analysis.confidence,
          reason: analysis.reason,
          recommendation: analysis.recommendation,
        },
      });
      
      // Se for falso positivo com alta confiança, marcar como resolvido
      if (analysis.isFalsePositive && analysis.confidence > 0.8) {
        await prisma.alert.update({
          where: { id: alert.id },
          data: {
            resolved_at: new Date(),
            metadata: {
              ...(alert.metadata as any),
              autoResolved: true,
              reason: analysis.reason,
            },
          },
        });
      }
    }
    
    const falsePositives = analyzedAlerts.filter(a => a.analysis.isFalsePositive).length;
    const autoResolved = analyzedAlerts.filter(
      a => a.analysis.isFalsePositive && a.analysis.confidence > 0.8
    ).length;
    
    logger.info(`✅ Analyzed ${alerts.length} alerts: ${falsePositives} false positives, ${autoResolved} auto-resolved`);
    
    return success({
      success: true,
      alertsAnalyzed: alerts.length,
      falsePositives,
      autoResolved,
      alerts: analyzedAlerts,
    });
    
  } catch (err) {
    logger.error('❌ Intelligent Alerts Analyzer error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

async function analyzeAlert(prisma: any, alert: any): Promise<{
  isFalsePositive: boolean;
  confidence: number;
  reason: string;
  recommendation: string;
}> {
  // Análise simples baseada em regras
  // Em produção, usar modelo de ML treinado
  
  const title = alert.title.toLowerCase();
  const metadata = alert.metadata || {};
  
  // Regra 1: Alertas de custo com variação < 10%
  if (title.includes('cost') && metadata.trendPercentage && Math.abs(metadata.trendPercentage) < 10) {
    return {
      isFalsePositive: true,
      confidence: 0.85,
      reason: 'Cost variation is within normal range (<10%)',
      recommendation: 'Adjust alert threshold to reduce noise',
    };
  }
  
  // Regra 2: Alertas duplicados nas últimas 24h
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  const similarAlerts = await prisma.alert.count({
    where: {
      organization_id: alert.organization_id,
      title: alert.title,
      triggered_at: { gte: oneDayAgo },
    },
  });
  
  if (similarAlerts > 5) {
    return {
      isFalsePositive: true,
      confidence: 0.9,
      reason: 'Multiple similar alerts in 24h indicate recurring issue or misconfiguration',
      recommendation: 'Review alert rule or fix underlying issue',
    };
  }
  
  // Regra 3: Alertas de endpoint com recovery rápido
  if (title.includes('endpoint') && metadata.downtime && metadata.downtime < 60) {
    return {
      isFalsePositive: true,
      confidence: 0.75,
      reason: 'Endpoint recovered quickly (<1 minute), likely transient issue',
      recommendation: 'Consider increasing alert threshold',
    };
  }
  
  // Default: não é falso positivo
  return {
    isFalsePositive: false,
    confidence: 0.5,
    reason: 'Alert appears legitimate',
    recommendation: 'Review and take appropriate action',
  };
}
