"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 Intelligent Alerts Analyzer started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const prisma = (0, database_js_1.getPrismaClient)();
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
                            ...alert.metadata,
                            autoResolved: true,
                            reason: analysis.reason,
                        },
                    },
                });
            }
        }
        const falsePositives = analyzedAlerts.filter(a => a.analysis.isFalsePositive).length;
        const autoResolved = analyzedAlerts.filter(a => a.analysis.isFalsePositive && a.analysis.confidence > 0.8).length;
        logging_js_1.logger.info(`✅ Analyzed ${alerts.length} alerts: ${falsePositives} false positives, ${autoResolved} auto-resolved`);
        return (0, response_js_1.success)({
            success: true,
            alertsAnalyzed: alerts.length,
            falsePositives,
            autoResolved,
            alerts: analyzedAlerts,
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Intelligent Alerts Analyzer error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
async function analyzeAlert(prisma, alert) {
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
            organizationId: alert.organizationId,
            title: alert.title,
            triggeredAt: { gte: oneDayAgo },
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
//# sourceMappingURL=intelligent-alerts-analyzer.js.map