"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 Auto Alerts started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId } = body;
        const prisma = (0, database_js_1.getPrismaClient)();
        const createdAlerts = [];
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
        logging_js_1.logger.info(`✅ Created ${createdAlerts.length} auto alerts`);
        return (0, response_js_1.success)({
            success: true,
            alertsCreated: createdAlerts.length,
            alerts: createdAlerts,
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Auto Alerts error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
async function detectCostAnomalies(prisma, organizationId, accountId) {
    const anomalies = [];
    // Buscar custos dos últimos 7 dias
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    // PADRONIZADO: usar organization_id e aws_account_id (snake_case) conforme schema Prisma
    const recentCosts = await prisma.dailyCost.groupBy({
        by: ['date'],
        where: {
            organization_id: organizationId,
            ...(accountId && { aws_account_id: accountId }),
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
    if (recentCosts.length < 2)
        return anomalies;
    // Calcular média e desvio padrão
    const costs = recentCosts.map((c) => c._sum.cost || 0);
    const avg = costs.reduce((sum, c) => sum + c, 0) / costs.length;
    const stdDev = Math.sqrt(costs.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / costs.length);
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
async function detectCriticalFindings(prisma, organizationId, accountId) {
    const findings = [];
    // Buscar findings críticos criados nas últimas 24 horas
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    // PADRONIZADO: usar organization_id e aws_account_id (snake_case) conforme schema Prisma
    const criticalFindings = await prisma.finding.findMany({
        where: {
            organization_id: organizationId,
            ...(accountId && { aws_account_id: accountId }),
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
async function detectCriticalDrifts(prisma, organizationId, accountId) {
    const drifts = [];
    // Buscar drifts críticos detectados nas últimas 24 horas
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    // PADRONIZADO: usar organization_id (snake_case) conforme schema Prisma
    const criticalDrifts = await prisma.driftDetection.findMany({
        where: {
            organization_id: organizationId,
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
async function detectComplianceViolations(prisma, organizationId, accountId) {
    const violations = [];
    // Buscar violações abertas nas últimas 24 horas
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    // PADRONIZADO: usar organization_id e aws_account_id (snake_case) conforme schema Prisma
    const recentViolations = await prisma.complianceViolation.findMany({
        where: {
            organization_id: organizationId,
            ...(accountId && { aws_account_id: accountId }),
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
//# sourceMappingURL=auto-alerts.js.map