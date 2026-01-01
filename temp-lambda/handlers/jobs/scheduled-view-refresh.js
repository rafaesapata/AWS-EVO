"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 Scheduled View Refresh started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        const refreshedViews = [];
        // Refresh security posture para todas as organizações
        const organizations = await prisma.organization.findMany({
            select: { id: true },
        });
        for (const org of organizations) {
            // Calcular e atualizar security posture
            const criticalFindings = await prisma.finding.count({
                where: { organization_id: org.id, severity: 'CRITICAL', status: 'ACTIVE' },
            });
            const highFindings = await prisma.finding.count({
                where: { organization_id: org.id, severity: 'HIGH', status: 'ACTIVE' },
            });
            const mediumFindings = await prisma.finding.count({
                where: { organization_id: org.id, severity: 'MEDIUM', status: 'ACTIVE' },
            });
            const lowFindings = await prisma.finding.count({
                where: { organization_id: org.id, severity: 'LOW', status: 'ACTIVE' },
            });
            const totalFindings = criticalFindings + highFindings + mediumFindings + lowFindings;
            const weightedScore = (criticalFindings * 40) + (highFindings * 25) + (mediumFindings * 10) + (lowFindings * 5);
            const maxPossibleScore = totalFindings > 0 ? totalFindings * 40 : 1;
            const overallScore = Math.max(0, 100 - ((weightedScore / maxPossibleScore) * 100));
            let riskLevel;
            if (overallScore >= 80)
                riskLevel = 'low';
            else if (overallScore >= 60)
                riskLevel = 'medium';
            else if (overallScore >= 40)
                riskLevel = 'high';
            else
                riskLevel = 'critical';
            await prisma.securityPosture.create({
                data: {
                    organization_id: org.id,
                    overall_score: overallScore,
                    critical_findings: criticalFindings,
                    high_findings: highFindings,
                    medium_findings: mediumFindings,
                    low_findings: lowFindings,
                    risk_level: riskLevel,
                    calculated_at: new Date(),
                },
            });
            refreshedViews.push(`security_posture_${org.id}`);
        }
        logging_js_1.logger.info(`✅ Refreshed ${refreshedViews.length} views`);
        return (0, response_js_1.success)({
            success: true,
            refreshedViews,
            organizationsProcessed: organizations.length,
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Scheduled View Refresh error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=scheduled-view-refresh.js.map