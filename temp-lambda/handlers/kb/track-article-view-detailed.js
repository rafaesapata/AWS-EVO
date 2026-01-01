"use strict";
/**
 * Track Article View Detailed Handler - Rastreia visualização detalhada do artigo
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    console.log('📊 Track Article View Detailed');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { p_article_id, p_session_id, p_source, p_search_query } = body;
        if (!p_article_id) {
            return (0, response_js_1.badRequest)('Article ID is required');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // Create detailed view record using raw query
        let viewId = null;
        try {
            viewId = crypto.randomUUID();
            await prisma.$executeRaw `
        INSERT INTO kb_article_views (id, article_id, user_id, organization_id, session_id, source, search_query, action, viewed_at)
        VALUES (${viewId}::uuid, ${p_article_id}::uuid, ${user.sub}::uuid, ${organizationId}::uuid, ${p_session_id}, ${p_source || 'direct'}, ${p_search_query}, 'view', NOW())
      `;
        }
        catch (e) {
            // If kb_article_views doesn't exist, just update the article
            viewId = null;
            console.log('KB article views table not available');
        }
        // Also increment the view count on the article
        await prisma.knowledgeBaseArticle.update({
            where: { id: p_article_id },
            data: {
                views: { increment: 1 }
            }
        }).catch(() => {
            // Ignore if update fails
        });
        console.log('✅ Article view tracked:', p_article_id);
        return (0, response_js_1.success)({
            tracked: true,
            article_id: p_article_id,
            view_id: viewId
        });
    }
    catch (err) {
        console.error('❌ Track Article View error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=track-article-view-detailed.js.map