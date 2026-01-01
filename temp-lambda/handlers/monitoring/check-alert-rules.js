"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
const client_sns_1 = require("@aws-sdk/client-sns");
async function handler(event, context) {
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('Check Alert Rules started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { ruleId } = body;
        const prisma = (0, database_js_1.getPrismaClient)();
        // Buscar regras de alerta ativas
        const alertRules = await prisma.alertRule.findMany({
            where: {
                organization_id: organizationId,
                is_active: true,
                ...(ruleId && { id: ruleId }),
            },
        });
        if (alertRules.length === 0) {
            return (0, response_js_1.success)({
                success: true,
                message: 'No active alert rules found',
                triggeredAlerts: [],
            });
        }
        const triggeredAlerts = [];
        // Verificar cada regra
        for (const rule of alertRules) {
            try {
                const triggered = await checkRule(prisma, rule);
                if (triggered) {
                    // Criar alerta
                    const alert = await prisma.alert.create({
                        data: {
                            organization_id: organizationId,
                            rule_id: rule.id,
                            severity: rule.severity,
                            title: rule.name,
                            message: `Alert triggered: ${rule.description}`,
                            metadata: triggered.metadata,
                            triggered_at: new Date(),
                        },
                    });
                    triggeredAlerts.push(alert);
                    // Enviar notificação
                    await sendAlertNotification(rule, triggered.metadata);
                    logging_js_1.logger.info('Alert triggered', {
                        organizationId,
                        ruleId: rule.id,
                        ruleName: rule.name,
                        alertId: alert.id
                    });
                }
            }
            catch (err) {
                logging_js_1.logger.error('Error checking rule', err, {
                    organizationId,
                    ruleId: rule.id
                });
            }
        }
        logging_js_1.logger.info('Alert rules check completed', {
            organizationId,
            rulesChecked: alertRules.length,
            alertsTriggered: triggeredAlerts.length
        });
        return (0, response_js_1.success)({
            success: true,
            rulesChecked: alertRules.length,
            triggeredAlerts: triggeredAlerts.length,
            alerts: triggeredAlerts,
        });
    }
    catch (err) {
        logging_js_1.logger.error('Check Alert Rules error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
async function checkRule(prisma, rule) {
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
        default:
            logging_js_1.logger.warn('Unknown rule type', { ruleType });
            return null;
    }
}
async function checkCostThreshold(prisma, rule) {
    const { organizationId, threshold } = rule;
    // Buscar custos dos últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const costs = await prisma.dailyCost.aggregate({
        where: {
            organizationId,
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
async function checkSecurityFindings(prisma, rule) {
    const { organizationId, condition } = rule;
    const findings = await prisma.finding.count({
        where: {
            organizationId,
            severity: condition.severity || 'CRITICAL',
            status: 'ACTIVE',
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
async function checkDriftDetection(prisma, rule) {
    const { organizationId } = rule;
    // Buscar drifts detectados nas últimas 24 horas
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const drifts = await prisma.driftDetection.count({
        where: {
            organizationId,
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
async function checkComplianceViolation(prisma, rule) {
    const { organizationId, condition } = rule;
    const violations = await prisma.complianceViolation.count({
        where: {
            organizationId,
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
async function sendAlertNotification(rule, metadata) {
    try {
        const snsClient = new client_sns_1.SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
        const message = `
Alert: ${rule.name}
Severity: ${rule.severity}
Description: ${rule.description}

Details:
${JSON.stringify(metadata, null, 2)}
    `.trim();
        if (rule.notificationChannels?.includes('sns')) {
            await snsClient.send(new client_sns_1.PublishCommand({
                TopicArn: process.env.SNS_ALERTS_TOPIC_ARN,
                Subject: `[${rule.severity}] ${rule.name}`,
                Message: message,
            }));
        }
    }
    catch (err) {
        logging_js_1.logger.error('Error sending alert notification', err, {
            ruleId: rule.id,
            ruleName: rule.name
        });
    }
}
//# sourceMappingURL=check-alert-rules.js.map