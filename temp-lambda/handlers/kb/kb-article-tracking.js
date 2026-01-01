"use strict";
/**
 * Lambda handler for KB Article Tracking
 * Handles increment_article_views, increment_article_helpful, track_article_view_detailed
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const middleware_js_1 = require("../../lib/middleware.js");
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const userId = user.sub || user.id || 'unknown';
        const prisma = (0, database_js_1.getPrismaClient)();
        const body = event.body ? JSON.parse(event.body) : {};
        // Determine action from path or body
        const path = (0, middleware_js_1.getHttpPath)(event);
        let action = 'increment_views';
        if (path.includes('increment_article_helpful') || body.action === 'increment_helpful') {
            action = 'increment_helpful';
        }
        else if (path.includes('track_article_view_detailed') || body.action === 'track_view_detailed') {
            action = 'track_view_detailed';
        }
        else if (path.includes('increment_article_views') || body.action === 'increment_views') {
            action = 'increment_views';
        }
        const articleId = body.article_id || body.p_article_id;
        if (!articleId) {
            return (0, response_js_1.badRequest)('Missing required field: article_id', undefined, origin);
        }
        // Verificar se artigo existe e pertence à organização
        const article = await prisma.knowledgeBaseArticle.findFirst({
            where: {
                id: articleId,
                organization_id: organizationId
            }
        });
        if (!article) {
            return (0, response_js_1.badRequest)('Article not found', undefined, origin);
        }
        switch (action) {
            case 'increment_views': {
                await prisma.knowledgeBaseArticle.update({
                    where: { id: articleId },
                    data: { views: { increment: 1 } }
                });
                logging_js_1.logger.info(`✅ Incremented views for article: ${articleId}`);
                return (0, response_js_1.success)({ success: true, action: 'views_incremented' }, 200, origin);
            }
            case 'increment_helpful': {
                await prisma.knowledgeBaseArticle.update({
                    where: { id: articleId },
                    data: { helpful_count: { increment: 1 } }
                });
                logging_js_1.logger.info(`✅ Incremented helpful for article: ${articleId}`);
                return (0, response_js_1.success)({ success: true, action: 'helpful_incremented' }, 200, origin);
            }
            case 'track_view_detailed': {
                const deviceType = body.p_device_type || 'desktop';
                const readingTime = body.p_reading_time || 0;
                // Increment view count
                await prisma.knowledgeBaseArticle.update({
                    where: { id: articleId },
                    data: { views: { increment: 1 } }
                });
                // Log detailed view info (analytics table not implemented yet)
                logging_js_1.logger.info(`View details: device=${deviceType}, readingTime=${readingTime}s`);
                logging_js_1.logger.info(`✅ Tracked detailed view for article: ${articleId}`);
                return (0, response_js_1.success)({ success: true, action: 'view_tracked' }, 200, origin);
            }
            default:
                return (0, response_js_1.badRequest)('Invalid action', undefined, origin);
        }
    }
    catch (err) {
        logging_js_1.logger.error('❌ KB article tracking error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
    }
}
//# sourceMappingURL=kb-article-tracking.js.map