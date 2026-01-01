"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 AI Prioritization started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const prisma = (0, database_js_1.getPrismaClient)();
        // Buscar findings ativos
        const findings = await prisma.finding.findMany({
            where: {
                organization_id: organizationId,
                status: 'ACTIVE',
            },
            take: 100,
        });
        // Calcular prioridade para cada finding
        const prioritizedFindings = findings.map(finding => {
            let priorityScore = 0;
            // Severidade
            switch (finding.severity) {
                case 'CRITICAL':
                    priorityScore += 100;
                    break;
                case 'HIGH':
                    priorityScore += 75;
                    break;
                case 'MEDIUM':
                    priorityScore += 50;
                    break;
                case 'LOW':
                    priorityScore += 25;
                    break;
            }
            // Idade (findings mais antigos têm maior prioridade)
            const ageInDays = Math.floor((Date.now() - new Date(finding.created_at).getTime()) / (1000 * 60 * 60 * 24));
            priorityScore += Math.min(ageInDays * 2, 30);
            // Compliance (se afeta compliance, maior prioridade)
            if (finding.compliance && finding.compliance.length > 0) {
                priorityScore += 20;
            }
            return {
                id: finding.id,
                title: finding.description,
                severity: finding.severity,
                priorityScore,
                priorityRank: 0,
                factors: {
                    severity: finding.severity,
                    ageInDays,
                    hasCompliance: finding.compliance && finding.compliance.length > 0,
                },
            };
        });
        // Ordenar por score e atribuir rank
        prioritizedFindings.sort((a, b) => b.priorityScore - a.priorityScore);
        prioritizedFindings.forEach((f, index) => {
            f.priorityRank = index + 1;
        });
        logging_js_1.logger.info(`✅ Prioritized ${prioritizedFindings.length} findings`);
        return (0, response_js_1.success)({
            success: true,
            findings: prioritizedFindings,
            summary: {
                total: prioritizedFindings.length,
                critical: prioritizedFindings.filter(f => f.severity === 'CRITICAL').length,
                high: prioritizedFindings.filter(f => f.severity === 'HIGH').length,
            },
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ AI Prioritization error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=ai-prioritization.js.map