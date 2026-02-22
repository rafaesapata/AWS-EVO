import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Check Alert Rules
 * AWS Lambda Handler for check-alert-rules
 * 
 * Verifica regras de alerta e dispara notificações quando necessário
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, safeHandler } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { checkAlertRulesSchema } from '../../lib/schemas.js';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

export const handler = safeHandler(async (
  event: AuthorizedEvent,
  context: LambdaContext
) => {
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationIdWithImpersonation(event, user);
  
  logger.info('Check Alert Rules started', { 
    organizationId,
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  try {
    // Validate input with Zod
    const validation = parseAndValidateBody(checkAlertRulesSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { ruleId, dryRun } = validation.data;
    
    const prisma = getPrismaClient();
    
    // Buscar regras de alerta ativas
    const alertRules = await prisma.alertRule.findMany({
      where: {
        organization_id: organizationId,
        is_active: true,
        ...(ruleId && { id: ruleId }),
      },
    });
    
    if (alertRules.length === 0) {
      return success({
        success: true,
        message: 'No active alert rules found',
        triggeredAlerts: [],
      });
    }
    
    const triggeredAlerts: any[] = [];
    
    // Verificar cada regra com cooldown
    for (const rule of alertRules) {
      try {
        // Cooldown check: skip if alert was triggered recently (default 15min)
        const cooldownMinutes = rule.cooldown_minutes ?? 15;
        const cooldownTime = new Date();
        cooldownTime.setMinutes(cooldownTime.getMinutes() - cooldownMinutes);
        
        const recentAlert = await prisma.alert.findFirst({
          where: {
            organization_id: organizationId,
            rule_id: rule.id,
            triggered_at: { gte: cooldownTime },
          },
          select: { id: true },
        });
        
        if (recentAlert && !dryRun) {
          logger.info('Skipping rule (cooldown active)', { ruleId: rule.id, ruleName: rule.name });
          continue;
        }
        
        const triggered = await checkRule(prisma, rule);
        
        if (triggered) {
          // Criar alerta
          const alert = await prisma.alert.create({
            data: {
              organization_id: organizationId,
              rule_id: rule.id,
              severity: rule.severity ?? 'medium',
              title: rule.name,
              message: `Alert triggered: ${rule.description ?? rule.name}`,
              metadata: triggered.metadata,
              triggered_at: new Date(),
            },
          });
          
          triggeredAlerts.push(alert);
          
          // Enviar notificação
          await sendAlertNotification(rule, triggered.metadata);
          
          logger.info('Alert triggered', { 
            organizationId, 
            ruleId: rule.id, 
            ruleName: rule.name,
            alertId: alert.id 
          });
        }
        
      } catch (err) {
        logger.error('Error checking rule', err as Error, { 
          organizationId, 
          ruleId: rule.id 
        });
      }
    }
    
    logger.info('Alert rules check completed', { 
      organizationId,
      rulesChecked: alertRules.length,
      alertsTriggered: triggeredAlerts.length 
    });
    
    return success({
      success: true,
      rulesChecked: alertRules.length,
      triggeredAlerts: triggeredAlerts.length,
      alerts: triggeredAlerts,
    });
    
  } catch (err) {
    logger.error('Check Alert Rules error', err as Error, { 
      organizationId,
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    return error('An unexpected error occurred. Please try again.', 500);
  }
});

async function checkRule(prisma: any, rule: any): Promise<{ metadata: any } | null> {
  const { ruleType, condition, threshold } = rule;
  
  switch (ruleType) {
    case 'cost_threshold':
      return await checkCostThreshold(prisma, rule);
    
    case 'security_finding':
      return await checkSecurityFindings(prisma, rule);
    
    case 'drift_detection':
      return await checkDriftDetection(prisma, rule);
    
    case 'compliance_violation':
      return await checkComplianceViolation(prisma, rule);
    
    case 'endpoint_health':
      return await checkEndpointHealth(prisma, rule);
    
    default:
      logger.warn('Unknown rule type', { ruleType });
      return null;
  }
}

async function checkCostThreshold(prisma: any, rule: any): Promise<{ metadata: any } | null> {
  const { organizationId, threshold } = rule;
  
  // Buscar custos dos últimos 30 dias
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const costs = await prisma.dailyCost.aggregate({
    where: {
      organization_id: organizationId,
      date: {
        gte: thirtyDaysAgo,
      },
    },
    _sum: {
      cost: true,
    },
  });
  
  const totalCost = costs._sum.cost || 0;
  
  if (totalCost > threshold) {
    return {
      metadata: {
        totalCost,
        threshold,
        period: '30 days',
        exceeded: totalCost - threshold,
      },
    };
  }
  
  return null;
}

async function checkSecurityFindings(prisma: any, rule: any): Promise<{ metadata: any } | null> {
  const { organizationId, condition } = rule;
  
  const findings = await prisma.finding.count({
    where: {
      organization_id: organizationId,
      severity: condition.severity || 'CRITICAL',
      status: 'open',
    },
  });
  
  if (findings > (condition.count || 0)) {
    return {
      metadata: {
        findingsCount: findings,
        severity: condition.severity,
        threshold: condition.count,
      },
    };
  }
  
  return null;
}

async function checkDriftDetection(prisma: any, rule: any): Promise<{ metadata: any } | null> {
  const { organizationId } = rule;
  
  // Buscar drifts detectados nas últimas 24 horas
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  const drifts = await prisma.driftDetection.count({
    where: {
      organization_id: organizationId,
      detected_at: {
        gte: oneDayAgo,
      },
    },
  });
  
  if (drifts > 0) {
    return {
      metadata: {
        driftsCount: drifts,
        period: '24 hours',
      },
    };
  }
  
  return null;
}

async function checkComplianceViolation(prisma: any, rule: any): Promise<{ metadata: any } | null> {
  const { organizationId, condition } = rule;
  
  const violations = await prisma.complianceViolation.count({
    where: {
      organization_id: organizationId,
      framework: condition.framework,
      status: 'OPEN',
    },
  });
  
  if (violations > (condition.count || 0)) {
    return {
      metadata: {
        violationsCount: violations,
        framework: condition.framework,
        threshold: condition.count,
      },
    };
  }
  
  return null;
}

async function checkEndpointHealth(prisma: any, rule: any): Promise<{ metadata: any } | null> {
  const { organization_id: organizationId, condition } = rule;
  
  const downEndpoints = await prisma.monitoredEndpoint.count({
    where: {
      organization_id: organizationId,
      is_active: true,
      last_status: 'down',
    },
  });
  
  const threshold = condition?.count ?? 1;
  
  if (downEndpoints >= threshold) {
    // Get details of down endpoints
    const endpoints = await prisma.monitoredEndpoint.findMany({
      where: {
        organization_id: organizationId,
        is_active: true,
        last_status: 'down',
      },
      select: { id: true, name: true, url: true, last_checked_at: true },
      take: 5,
    });
    
    return {
      metadata: {
        downEndpoints,
        threshold,
        endpoints: endpoints.map((e: any) => ({
          name: e.name,
          url: e.url,
          lastChecked: e.last_checked_at,
        })),
      },
    };
  }
  
  return null;
}

async function sendAlertNotification(rule: any, metadata: any): Promise<void> {
  try {
    const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
    
    const message = `
Alert: ${rule.name}
Severity: ${rule.severity}
Description: ${rule.description}

Details:
${JSON.stringify(metadata, null, 2)}
    `.trim();
    
    if (rule.notificationChannels?.includes('sns')) {
      await snsClient.send(new PublishCommand({
        TopicArn: process.env.SNS_ALERTS_TOPIC_ARN,
        Subject: `[${rule.severity}] ${rule.name}`,
        Message: message,
      }));
    }
    
  } catch (err) {
    logger.error('Error sending alert notification', err as Error, { 
      ruleId: rule.id, 
      ruleName: rule.name 
    });
  }
}
