"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 KB AI Suggestions started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { query, limit = 5 } = body;
        if (!query) {
            return (0, response_js_1.error)('Missing required parameter: query');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // Buscar artigos relevantes da knowledge base
        const articles = await prisma.knowledgeBaseArticle.findMany({
            where: {
                organization_id: organizationId,
                OR: [
                    { title: { contains: query, mode: 'insensitive' } },
                    { content: { contains: query, mode: 'insensitive' } },
                    { tags: { hasSome: [query] } },
                ],
            },
            take: limit,
            orderBy: { views: 'desc' },
        });
        // Gerar sugestões baseadas em padrões
        const suggestions = articles.map(article => ({
            id: article.id,
            title: article.title,
            summary: article.content.substring(0, 200) + '...', // Generate summary from content
            relevanceScore: calculateRelevance(query, article),
            url: `/kb/${article.id}`,
        }));
        // Ordenar por relevância
        suggestions.sort((a, b) => b.relevanceScore - a.relevanceScore);
        logging_js_1.logger.info(`✅ Found ${suggestions.length} AI suggestions`);
        return (0, response_js_1.success)({
            success: true,
            query,
            suggestions,
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ KB AI Suggestions error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
function calculateRelevance(query, article) {
    let score = 0;
    const queryLower = query.toLowerCase();
    const titleLower = article.title.toLowerCase();
    const contentLower = article.content.toLowerCase();
    // Título contém query exata
    if (titleLower.includes(queryLower))
        score += 50;
    // Conteúdo contém query
    if (contentLower.includes(queryLower))
        score += 20;
    // Tags match
    if (article.tags?.some((tag) => tag.toLowerCase().includes(queryLower))) {
        score += 30;
    }
    // Boost por popularidade
    score += Math.min(article.views || 0, 20);
    return score;
}
//# sourceMappingURL=kb-ai-suggestions.js.map