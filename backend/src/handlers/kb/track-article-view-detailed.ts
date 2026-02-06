/**
 * Track Article View Detailed Handler - Rastreia visualização detalhada do artigo
 */

import { getHttpMethod } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';

interface RequestBody {
  p_article_id: string;
  p_user_id?: string;
  p_session_id?: string;
  p_source?: string;
  p_search_query?: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  console.log('📊 Track Article View Detailed');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const body: RequestBody = event.body ? JSON.parse(event.body) : {};
    const { p_article_id, p_session_id, p_source, p_search_query } = body;
    
    if (!p_article_id) {
      return badRequest('Article ID is required');
    }
    
    const prisma = getPrismaClient();
    
    // Create detailed view record using raw query
    let viewId: string | null = null;
    try {
      viewId = crypto.randomUUID();
      await (prisma as any).$executeRaw`
        INSERT INTO kb_article_views (id, article_id, user_id, organization_id, session_id, source, search_query, action, viewed_at)
        VALUES (${viewId}::uuid, ${p_article_id}::uuid, ${user.sub}::uuid, ${organizationId}::uuid, ${p_session_id}, ${p_source || 'direct'}, ${p_search_query}, 'view', NOW())
      `;
    } catch (e) {
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
    
    return success({
      tracked: true,
      article_id: p_article_id,
      view_id: viewId
    });
    
  } catch (err) {
    console.error('❌ Track Article View error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
  }
}
