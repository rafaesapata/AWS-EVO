"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
async function handler(event, context) {
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('Get Security Posture started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        // Contar findings por severidade (case-insensitive, incluindo pending e active)
        const criticalFindings = await prisma.finding.count({
            where: {
                organization_id: organizationId,
                severity: { in: ['critical', 'CRITICAL'] },
                status: { in: ['pending', 'active', 'ACTIVE', 'PENDING'] }
            },
        });
        const highFindings = await prisma.finding.count({
            where: {
                organization_id: organizationId,
                severity: { in: ['high', 'HIGH'] },
                status: { in: ['pending', 'active', 'ACTIVE', 'PENDING'] }
            },
        });
        const mediumFindings = await prisma.finding.count({
            where: {
                organization_id: organizationId,
                severity: { in: ['medium', 'MEDIUM'] },
                status: { in: ['pending', 'active', 'ACTIVE', 'PENDING'] }
            },
        });
        const lowFindings = await prisma.finding.count({
            where: {
                organization_id: organizationId,
                severity: { in: ['low', 'LOW'] },
                status: { in: ['pending', 'active', 'ACTIVE', 'PENDING'] }
            },
        });
        // Calcular score (0-100)
        const totalFindings = criticalFindings + highFindings + mediumFindings + lowFindings;
        const weightedScore = (criticalFindings * 40) + (highFindings * 25) + (mediumFindings * 10) + (lowFindings * 5);
        const maxPossibleScore = totalFindings > 0 ? totalFindings * 40 : 1;
        const overallScore = Math.max(0, 100 - ((weightedScore / maxPossibleScore) * 100));
        // Determinar nível de risco
        let riskLevel;
        if (overallScore >= 80)
            riskLevel = 'low';
        else if (overallScore >= 60)
            riskLevel = 'medium';
        else if (overallScore >= 40)
            riskLevel = 'high';
        else
            riskLevel = 'critical';
        // Salvar postura
        await prisma.securityPosture.create({
            data: {
                organization_id: organizationId,
                overall_score: overallScore,
                critical_findings: criticalFindings,
                high_findings: highFindings,
                medium_findings: mediumFindings,
                low_findings: lowFindings,
                risk_level: riskLevel,
                calculated_at: new Date(),
            },
        });
        logging_js_1.logger.info('Security posture calculated', {
            organizationId,
            overallScore: parseFloat(overallScore.toFixed(1)),
            riskLevel,
            totalFindings
        });
        return (0, response_js_1.success)({
            success: true,
            posture: {
                overallScore: parseFloat(overallScore.toFixed(1)),
                riskLevel,
                findings: {
                    critical: criticalFindings,
                    high: highFindings,
                    medium: mediumFindings,
                    low: lowFindings,
                    total: totalFindings,
                },
                calculatedAt: new Date().toISOString(),
            },
        });
    }
    catch (err) {
        logging_js_1.logger.error('Get Security Posture error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=get-security-posture.js.map