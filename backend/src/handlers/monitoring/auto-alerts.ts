import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Auto Alerts
 * AWS Lambda Handler for auto-alerts
 * 
 * Cria alertas automáticos baseados em anomalias detectadas
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient, getOptionalCredentialFilter } from '../../lib/database.js';
import { autoAlertsRequestSchema } from '../../lib/schemas.js';
import { parseAndValidateBody } from '../../lib/validation.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Auto Alerts started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Validate request body
    const validation = parseAndValidateBody(autoAlertsRequestSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    const { accountId } = validation.data;
    
    const prisma = getPrismaClient();
    
    const createdAlerts: any[] = [];
    
    // Cooldown: buscar alertas recentes para evitar duplicatas (últimos 30min)
    const cooldownWindow = new Date();
    cooldownWindow.setMinutes(cooldownWindow.getMinutes() - 30);
    
    const recentAlerts = await prisma.alert.findMany({
      where: {
        organization_id: organizationId,
        triggered_at: { gte: cooldownWindow },
      },
      select: { title: true, severity: true },
    });
    const recentAlertTitles = new Set(recentAlerts.map((a: any) => a.title));
    
    // Helper: criar alerta com cooldown check
    const createAlertIfNew = async (data: { severity: string; title: string; message: string; metadata: any }) => {
      if (recentAlertTitles.has(data.title)) {
        logger.info(`Skipping duplicate alert (cooldown): ${data.title}`);
        return null;
      }
      const alert = await prisma.alert.create({
        data: {
          organization_id: organizationId,
          severity: data.severity,
          title: data.title,
          message: data.message,
          metadata: data.metadata,
          triggered_at: new Date(),
        },
      });
      recentAlertTitles.add(data.title);
      createdAlerts.push(alert);
      return alert;
    };
    
    // 1. Verificar anomalias de custo
    const costAnomalies = await detectCostAnomalies(prisma, organizationId, accountId);
    for (const anomaly of costAnomalies) {
      await createAlertIfNew({
        severity: anomaly.severity,
        title: 'Cost Anomaly Detected',
        message: anomaly.message,
        metadata: anomaly.metadata,
      });
    }
    
    // 2. Verificar novos findings críticos
    const criticalFindings = await detectCriticalFindings(prisma, organizationId, accountId);
    for (const finding of criticalFindings) {
      await createAlertIfNew({
        severity: 'CRITICAL',
        title: `Critical Security Finding: ${finding.metadata?.title || 'Unknown'}`,
        message: finding.message,
        metadata: finding.metadata,
      });
    }
    
    // 3. Verificar drifts críticos
    const criticalDrifts = await detectCriticalDrifts(prisma, organizationId, accountId);
    for (const drift of criticalDrifts) {
      await createAlertIfNew({
        severity: 'HIGH',
        title: `Critical Drift: ${drift.metadata?.driftType || 'Unknown'}`,
        message: drift.message,
        metadata: drift.metadata,
      });
    }
    
    // 4. Verificar violações de compliance
    const complianceViolations = await detectComplianceViolations(prisma, organizationId, accountId);
    for (const violation of complianceViolations) {
      await createAlertIfNew({
        severity: 'HIGH',
        title: `Compliance Violation: ${violation.metadata?.controlId || 'Unknown'}`,
        message: violation.message,
        metadata: violation.metadata,
      });
    }
    
    // 5. Verificar endpoints down
    const endpointAlerts = await detectEndpointAnomalies(prisma, organizationId);
    for (const epAlert of endpointAlerts) {
      await createAlertIfNew({
        severity: epAlert.severity,
        title: epAlert.title,
        message: epAlert.message,
        metadata: epAlert.metadata,
      });
    }
    
    logger.info(`✅ Created ${createdAlerts.length} auto alerts`);
    
    return success({
      success: true,
      alertsCreated: createdAlerts.length,
      alerts: createdAlerts,
    });
    
  } catch (err) {
    logger.error('❌ Auto Alerts error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
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
  
  // PADRONIZADO: usar organization_id e multi-cloud filter
  const recentCosts = await prisma.dailyCost.groupBy({
    by: ['date'],
    where: {
      organization_id: organizationId,
      ...getOptionalCredentialFilter(accountId),
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
  
  // PADRONIZADO: usar organization_id e multi-cloud filter
  const criticalFindings = await prisma.finding.findMany({
    where: {
      organization_id: organizationId,
      ...getOptionalCredentialFilter(accountId),
      severity: 'CRITICAL',
      status: 'ACTIVE',
      created_at: {
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
  
  // PADRONIZADO: usar organization_id e multi-cloud filter
  const criticalDrifts = await prisma.driftDetection.findMany({
    where: {
      organization_id: organizationId,
      ...getOptionalCredentialFilter(accountId),
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
  
  // PADRONIZADO: usar organization_id e multi-cloud filter
  const recentViolations = await prisma.complianceViolation.findMany({
    where: {
      organization_id: organizationId,
      ...getOptionalCredentialFilter(accountId),
      status: 'OPEN',
      detected_at: {
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

async function detectEndpointAnomalies(
  prisma: any,
  organizationId: string
): Promise<any[]> {
  const alerts: any[] = [];
  
  // Buscar endpoints que estão down
  const downEndpoints = await prisma.monitoredEndpoint.findMany({
    where: {
      organization_id: organizationId,
      is_active: true,
      last_status: 'down',
    },
    take: 20,
  });
  
  for (const endpoint of downEndpoints) {
    alerts.push({
      severity: 'CRITICAL',
      title: `Endpoint Down: ${endpoint.name}`,
      message: `Monitored endpoint ${endpoint.url} is not responding. Last checked: ${endpoint.last_checked_at?.toISOString() || 'never'}`,
      metadata: {
        endpointId: endpoint.id,
        url: endpoint.url,
        lastStatus: endpoint.last_status,
        lastResponseTime: endpoint.last_response_time,
      },
    });
  }
  
  // Buscar endpoints com SSL expirando em 7 dias
  const sslExpiryThreshold = new Date();
  sslExpiryThreshold.setDate(sslExpiryThreshold.getDate() + 7);
  
  const expiringSSL = await prisma.monitoredEndpoint.findMany({
    where: {
      organization_id: organizationId,
      is_active: true,
      monitor_ssl: true,
      ssl_expiry_date: {
        lte: sslExpiryThreshold,
        gte: new Date(),
      },
    },
    take: 10,
  });
  
  for (const endpoint of expiringSSL) {
    const daysLeft = Math.ceil((endpoint.ssl_expiry_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    alerts.push({
      severity: daysLeft <= 3 ? 'CRITICAL' : 'HIGH',
      title: `SSL Expiring: ${endpoint.name}`,
      message: `SSL certificate for ${endpoint.url} expires in ${daysLeft} days`,
      metadata: {
        endpointId: endpoint.id,
        url: endpoint.url,
        sslExpiryDate: endpoint.ssl_expiry_date,
        daysUntilExpiry: daysLeft,
      },
    });
  }
  
  // Buscar endpoints com alta latência (degraded)
  const degradedEndpoints = await prisma.monitoredEndpoint.findMany({
    where: {
      organization_id: organizationId,
      is_active: true,
      last_status: 'degraded',
    },
    take: 10,
  });
  
  for (const endpoint of degradedEndpoints) {
    alerts.push({
      severity: 'MEDIUM',
      title: `Endpoint Degraded: ${endpoint.name}`,
      message: `Endpoint ${endpoint.url} is responding slowly (${endpoint.last_response_time}ms)`,
      metadata: {
        endpointId: endpoint.id,
        url: endpoint.url,
        responseTime: endpoint.last_response_time,
      },
    });
  }
  
  return alerts;
}
