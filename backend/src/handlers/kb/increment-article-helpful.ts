/**
 * Increment Article Helpful Handler - Marca artigo como útil
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
  console.log('👍 Increment Article Helpful');
  
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
    
    // Increment helpful count
    const updated = await prisma.knowledgeBaseArticle.update({
      where: { id: article_id },
      data: {
        helpful_count: { increment: 1 },
        updated_at: new Date()
      }
    });
    
    // Log the action using raw query
    try {
      await (prisma as any).$executeRaw`
        INSERT INTO kb_article_views (id, article_id, user_id, organization_id, action, viewed_at)
        VALUES (${crypto.randomUUID()}::uuid, ${article_id}::uuid, ${user.sub}::uuid, ${organizationId}::uuid, 'helpful', NOW())
      `;
    } catch (e) {
      // Ignore if table doesn't exist
      console.log('KB article views table not available');
    }
    
    console.log('✅ Article marked as helpful:', article_id);
    
    return success({
      article_id,
      helpful_count: updated.helpful_count,
      message: 'Article marked as helpful'
    });
    
  } catch (err) {
    console.error('❌ Increment Article Helpful error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
  }
}
