/**
 * Increment Article Views Handler - Incrementa visualizações do artigo
 */

import { getHttpMethod } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, notFound, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';

interface RequestBody {
  article_id: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  console.log('👁️ Increment Article Views');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const body: RequestBody = event.body ? JSON.parse(event.body) : {};
    const { article_id } = body;
    
    if (!article_id) {
      return badRequest('Article ID is required');
    }
    
    const prisma = getPrismaClient();
    
    // Check if article exists
    const article = await prisma.knowledgeBaseArticle.findFirst({
      where: {
        id: article_id,
        organization_id: organizationId
      }
    });
    
    if (!article) {
      return notFound('Article not found');
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
    
    return success({
      article_id,
      view_count: updated.views,
      message: 'View count incremented'
    });
    
  } catch (err) {
    console.error('❌ Increment Article Views error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
  }
}
