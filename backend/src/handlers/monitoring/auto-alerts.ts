/**
 * Lambda handler for Auto Alerts
 * AWS Lambda Handler for auto-alerts
 * 
 * Cria alertas automáticos baseados em anomalias detectadas
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';

interface AutoAlertsRequest {
  accountId?: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Auto Alerts started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: AutoAlertsRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId } = body;
    
    const prisma = getPrismaClient();
    
    const createdAlerts: any[] = [];
    
    // 1. Verificar anomalias de custo
    const costAnomalies = await detectCostAnomalies(prisma, organizationId, accountId);
    for (const anomaly of costAnomalies) {
      const alert = await prisma.alert.create({
        data: {
          organization_id: organizationId,
          severity: anomaly.severity,
          title: 'Cost Anomaly Detected',
          message: anomaly.message,
          metadata: anomaly.metadata,
          triggered_at: new Date(),
        },
      });
      createdAlerts.push(alert);
    }
    
    // 2. Verificar novos findings críticos
    const criticalFindings = await detectCriticalFindings(prisma, organizationId, accountId);
    for (const finding of criticalFindings) {
      const alert = await prisma.alert.create({
        data: {
          organization_id: organizationId,
          severity: 'CRITICAL',
          title: 'Critical Security Finding',
          message: finding.message,
          metadata: finding.metadata,
          triggered_at: new Date(),
        },
      });
      createdAlerts.push(alert);
    }
    
    // 3. Verificar drifts críticos
    const criticalDrifts = await detectCriticalDrifts(prisma, organizationId, accountId);
    for (const drift of criticalDrifts) {
      const alert = await prisma.alert.create({
        data: {
          organization_id: organizationId,
          severity: 'HIGH',
          title: 'Critical Drift Detected',
          message: drift.message,
          metadata: drift.metadata,
          triggered_at: new Date(),
        },
      });
      createdAlerts.push(alert);
    }
    
    // 4. Verificar violações de compliance
    const complianceViolations = await detectComplianceViolations(prisma, organizationId, accountId);
    for (const violation of complianceViolations) {
      const alert = await prisma.alert.create({
        data: {
          organization_id: organizationId,
          severity: 'HIGH',
          title: 'Compliance Violation',
          message: violation.message,
          metadata: violation.metadata,
          triggered_at: new Date(),
        },
      });
      createdAlerts.push(alert);
    }
    
    logger.info(`✅ Created ${createdAlerts.length} auto alerts`);
    
    return success({
      success: true,
      alertsCreated: createdAlerts.length,
      alerts: createdAlerts,
    });
    
  } catch (err) {
    logger.error('❌ Auto Alerts error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

async function detectCostAnomalies(
  prisma: any,
  organizationId: string,
  accountId?: string
): Promise<any[]> {
  const anomalies: any[] = [];
  
  // Buscar custos dos últimos 7 dias
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const recentCosts = await prisma.dailyCost.groupBy({
    by: ['date'],
    where: {
      organizationId,
      ...(accountId && { accountId }),
      date: {
        gte: sevenDaysAgo,
      },
    },
    _sum: {
      cost: true,
    },
    orderBy: {
      date: 'asc',
    },
  });
  
  if (recentCosts.length < 2) return anomalies;
  
  // Calcular média e desvio padrão
  const costs = recentCosts.map((c: any) => c._sum.cost || 0);
  const avg = costs.reduce((sum: number, c: number) => sum + c, 0) / costs.length;
  const stdDev = Math.sqrt(
    costs.reduce((sum: number, c: number) => sum + Math.pow(c - avg, 2), 0) / costs.length
  );
  
  // Verificar se o custo de hoje está acima de 2 desvios padrão
  const todayCost = costs[costs.length - 1];
  if (todayCost > avg + (2 * stdDev)) {
    anomalies.push({
      severity: 'HIGH',
      message: `Daily cost spike detected: $${todayCost.toFixed(2)} (avg: $${avg.toFixed(2)})`,
      metadata: {
        todayCost,
        avgCost: avg,
        stdDev,
        threshold: avg + (2 * stdDev),
      },
    });
  }
  
  return anomalies;
}

async function detectCriticalFindings(
  prisma: any,
  organizationId: string,
  accountId?: string
): Promise<any[]> {
  const findings: any[] = [];
  
  // Buscar findings críticos criados nas últimas 24 horas
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  const criticalFindings = await prisma.finding.findMany({
    where: {
      organizationId,
      ...(accountId && { accountId }),
      severity: 'CRITICAL',
      status: 'ACTIVE',
      createdAt: {
        gte: oneDayAgo,
      },
    },
    take: 10,
  });
  
  for (const finding of criticalFindings) {
    findings.push({
      message: `Critical finding: ${finding.title}`,
      metadata: {
        findingId: finding.id,
        title: finding.title,
        resourceId: finding.resourceId,
        severity: finding.severity,
      },
    });
  }
  
  return findings;
}

async function detectCriticalDrifts(
  prisma: any,
  organizationId: string,
  accountId?: string
): Promise<any[]> {
  const drifts: any[] = [];
  
  // Buscar drifts críticos detectados nas últimas 24 horas
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  const criticalDrifts = await prisma.driftDetection.findMany({
    where: {
      organizationId,
      ...(accountId && { aws_account_id: accountId }),
      severity: 'critical',
      detected_at: {
        gte: oneDayAgo,
      },
    },
    take: 10,
  });
  
  for (const drift of criticalDrifts) {
    drifts.push({
      message: `Critical drift: ${drift.drift_type} on ${drift.resource_type}`,
      metadata: {
        driftId: drift.id,
        resourceId: drift.resource_id,
        driftType: drift.drift_type,
        severity: drift.severity,
      },
    });
  }
  
  return drifts;
}

async function detectComplianceViolations(
  prisma: any,
  organizationId: string,
  accountId?: string
): Promise<any[]> {
  const violations: any[] = [];
  
  // Buscar violações abertas nas últimas 24 horas
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  const recentViolations = await prisma.complianceViolation.findMany({
    where: {
      organizationId,
      ...(accountId && { accountId }),
      status: 'OPEN',
      detectedAt: {
        gte: oneDayAgo,
      },
    },
    take: 10,
  });
  
  for (const violation of recentViolations) {
    violations.push({
      message: `Compliance violation: ${violation.controlId} (${violation.framework})`,
      metadata: {
        violationId: violation.id,
        framework: violation.framework,
        controlId: violation.controlId,
        resourceId: violation.resourceId,
      },
    });
  }
  
  return violations;
}
