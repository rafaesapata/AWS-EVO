"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 Generate AI Insights started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId, insightType = 'all' } = body;
        const prisma = (0, database_js_1.getPrismaClient)();
        const insights = [];
        // Cost Insights
        if (insightType === 'cost' || insightType === 'all') {
            const costInsights = await generateCostInsights(prisma, organizationId, accountId);
            insights.push(...costInsights);
        }
        // Security Insights
        if (insightType === 'security' || insightType === 'all') {
            const securityInsights = await generateSecurityInsights(prisma, organizationId, accountId);
            insights.push(...securityInsights);
        }
        // Performance Insights
        if (insightType === 'performance' || insightType === 'all') {
            const performanceInsights = await generatePerformanceInsights(prisma, organizationId, accountId);
            insights.push(...performanceInsights);
        }
        // Ordenar por prioridade
        insights.sort((a, b) => {
            const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            return priorityOrder[a.priority] -
                priorityOrder[b.priority];
        });
        logging_js_1.logger.info(`✅ Generated ${insights.length} AI insights`);
        return (0, response_js_1.success)({
            success: true,
            insights,
            summary: {
                total: insights.length,
                critical: insights.filter(i => i.priority === 'critical').length,
                high: insights.filter(i => i.priority === 'high').length,
                medium: insights.filter(i => i.priority === 'medium').length,
                low: insights.filter(i => i.priority === 'low').length,
            },
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Generate AI Insights error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
async function generateCostInsights(prisma, organizationId, accountId) {
    const insights = [];
    // Analisar custos dos últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const costs = await prisma.dailyCost.groupBy({
        by: ['service'],
        where: {
            organizationId,
            ...(accountId && { accountId }),
            date: { gte: thirtyDaysAgo },
        },
        _sum: { cost: true },
        orderBy: { _sum: { cost: 'desc' } },
        take: 5,
    });
    if (costs.length > 0) {
        const topService = costs[0];
        const totalCost = costs.reduce((sum, c) => sum + (c._sum.cost || 0), 0);
        const topServicePercentage = ((topService._sum.cost || 0) / totalCost) * 100;
        if (topServicePercentage > 50) {
            insights.push({
                type: 'cost',
                priority: 'high',
                title: 'High Cost Concentration',
                description: `${topService.service} represents ${topServicePercentage.toFixed(1)}% of your total costs`,
                recommendation: 'Consider optimizing this service or diversifying your infrastructure',
                impact: 'high',
            });
        }
    }
    return insights;
}
async function generateSecurityInsights(prisma, organizationId, accountId) {
    const insights = [];
    // Analisar findings críticos
    const criticalFindings = await prisma.finding.count({
        where: {
            organizationId,
            ...(accountId && { accountId }),
            severity: 'CRITICAL',
            status: 'ACTIVE',
        },
    });
    if (criticalFindings > 0) {
        insights.push({
            type: 'security',
            priority: 'critical',
            title: 'Critical Security Findings',
            description: `You have ${criticalFindings} critical security findings that need immediate attention`,
            recommendation: 'Review and remediate critical findings as soon as possible',
            impact: 'critical',
        });
    }
    return insights;
}
async function generatePerformanceInsights(prisma, organizationId, accountId) {
    const insights = [];
    // Analisar waste detection
    const wasteItems = await prisma.wasteDetection.count({
        where: {
            organizationId,
            ...(accountId && { accountId }),
            wasteType: 'zombie',
        },
    });
    if (wasteItems > 0) {
        insights.push({
            type: 'performance',
            priority: 'medium',
            title: 'Zombie Resources Detected',
            description: `Found ${wasteItems} zombie resources that are consuming costs without providing value`,
            recommendation: 'Review and terminate unused resources',
            impact: 'medium',
        });
    }
    return insights;
}
//# sourceMappingURL=generate-ai-insights.js.map