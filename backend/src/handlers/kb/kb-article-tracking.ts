/**
 * Lambda handler for KB Article Tracking
 * Handles increment_article_views, increment_article_helpful, track_article_view_detailed
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod, getHttpPath, getOrigin } from '../../lib/middleware.js';

interface IncrementViewsRequest {
  article_id: string;
}

interface IncrementHelpfulRequest {
  article_id: string;
}

interface TrackViewDetailedRequest {
  p_article_id: string;
  p_device_type?: string;
  p_reading_time?: number;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const userId = user.sub || user.id || 'unknown';

    const prisma = getPrismaClient();
    const body = event.body ? JSON.parse(event.body) : {};
    
    // Determine action from path or body
    const path = getHttpPath(event);
    let action = 'increment_views';
    
    if (path.includes('increment_article_helpful') || body.action === 'increment_helpful') {
      action = 'increment_helpful';
    } else if (path.includes('track_article_view_detailed') || body.action === 'track_view_detailed') {
      action = 'track_view_detailed';
    } else if (path.includes('increment_article_views') || body.action === 'increment_views') {
      action = 'increment_views';
    }

    const articleId = body.article_id || body.p_article_id;
    
    if (!articleId) {
      return badRequest('Missing required field: article_id', undefined, origin);
    }

    // Verificar se artigo existe e pertence à organização
    const article = await prisma.knowledgeBaseArticle.findFirst({
      where: {
        id: articleId,
        organization_id: organizationId
      }
    });

    if (!article) {
      return badRequest('Article not found', undefined, origin);
    }

    switch (action) {
      case 'increment_views': {
        await prisma.knowledgeBaseArticle.update({
          where: { id: articleId },
          data: { views: { increment: 1 } }
        });
        
        logger.info(`✅ Incremented views for article: ${articleId}`);
        return success({ success: true, action: 'views_incremented' }, 200, origin);
      }

      case 'increment_helpful': {
        await prisma.knowledgeBaseArticle.update({
          where: { id: articleId },
          data: { helpful_count: { increment: 1 } }
        });
        
        logger.info(`✅ Incremented helpful for article: ${articleId}`);
        return success({ success: true, action: 'helpful_incremented' }, 200, origin);
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
        logger.info(`View details: device=${deviceType}, readingTime=${readingTime}s`);

        logger.info(`✅ Tracked detailed view for article: ${articleId}`);
        return success({ success: true, action: 'view_tracked' }, 200, origin);
      }

      default:
        return badRequest('Invalid action', undefined, origin);
    }

  } catch (err) {
    logger.error('❌ KB article tracking error:', err);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}
