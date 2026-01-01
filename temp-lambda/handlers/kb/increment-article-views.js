"use strict";
/**
 * Increment Article Views Handler - Incrementa visualizações do artigo
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    console.log('👁️ Increment Article Views');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { article_id } = body;
        if (!article_id) {
            return (0, response_js_1.badRequest)('Article ID is required');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // Check if article exists
        const article = await prisma.knowledgeBaseArticle.findFirst({
            where: {
                id: article_id,
                organization_id: organizationId
            }
        });
        if (!article) {
            return (0, response_js_1.notFound)('Article not found');
        }
        // Increment view count
        const updated = await prisma.knowledgeBaseArticle.update({
            where: { id: article_id },
            data: {
                views: { increment: 1 },
                updated_at: new Date()
            }
        });
        console.log('✅ Article view incremented:', article_id);
        return (0, response_js_1.success)({
            article_id,
            view_count: updated.views,
            message: 'View count incremented'
        });
    }
    catch (err) {
        console.error('❌ Increment Article Views error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=increment-article-views.js.map