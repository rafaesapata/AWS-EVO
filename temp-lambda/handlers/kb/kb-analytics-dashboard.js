"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 KB Analytics Dashboard started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const prisma = (0, database_js_1.getPrismaClient)();
        // Total de artigos
        const totalArticles = await prisma.knowledgeBaseArticle.count({
            where: { organization_id: organizationId },
        });
        // Artigos publicados
        const publishedArticles = await prisma.knowledgeBaseArticle.count({
            where: {
                organization_id: organizationId,
                status: 'published',
            },
        });
        // Top 10 artigos mais visualizados
        const topArticles = await prisma.knowledgeBaseArticle.findMany({
            where: { organization_id: organizationId },
            orderBy: { views: 'desc' },
            take: 10,
            select: {
                id: true,
                title: true,
                views: true,
                created_at: true,
            },
        });
        // Artigos por categoria
        const articlesByCategory = await prisma.knowledgeBaseArticle.groupBy({
            by: ['category'],
            where: { organization_id: organizationId },
            _count: true,
        });
        // Total de visualizações
        const totalViews = await prisma.knowledgeBaseArticle.aggregate({
            where: { organization_id: organizationId },
            _sum: {
                views: true,
            },
        });
        // Artigos criados nos últimos 30 dias
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentArticles = await prisma.knowledgeBaseArticle.count({
            where: {
                organization_id: organizationId,
                created_at: {
                    gte: thirtyDaysAgo,
                },
            },
        });
        // Tags mais usadas
        const allArticles = await prisma.knowledgeBaseArticle.findMany({
            where: { organization_id: organizationId },
            select: { tags: true },
        });
        const tagCounts = {};
        allArticles.forEach(article => {
            article.tags?.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        });
        const topTags = Object.entries(tagCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([tag, count]) => ({ tag, count }));
        logging_js_1.logger.info(`✅ KB Analytics: ${totalArticles} articles, ${totalViews._sum?.views || 0} views`);
        return (0, response_js_1.success)({
            success: true,
            summary: {
                totalArticles,
                publishedArticles,
                draftArticles: totalArticles - publishedArticles,
                totalViews: totalViews._sum?.views || 0,
                recentArticles,
            },
            topArticles,
            articlesByCategory: articlesByCategory.map(c => ({
                category: c.category,
                count: c._count,
            })),
            topTags,
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ KB Analytics Dashboard error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=kb-analytics-dashboard.js.map