import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for KB AI Suggestions
 * AWS Lambda Handler for kb-ai-suggestions
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';

interface KBAISuggestionsRequest {
  query: string;
  limit?: number;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 KB AI Suggestions started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const body: KBAISuggestionsRequest = event.body ? JSON.parse(event.body) : {};
    const { query, limit = 5 } = body;
    
    if (!query) {
      return error('Missing required parameter: query');
    }
    
    const prisma = getPrismaClient();
    
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
    
    logger.info(`✅ Found ${suggestions.length} AI suggestions`);
    
    return success({
      success: true,
      query,
      suggestions,
    });
    
  } catch (err) {
    logger.error('❌ KB AI Suggestions error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

function calculateRelevance(query: string, article: any): number {
  let score = 0;
  const queryLower = query.toLowerCase();
  const titleLower = article.title.toLowerCase();
  const contentLower = article.content.toLowerCase();
  
  // Título contém query exata
  if (titleLower.includes(queryLower)) score += 50;
  
  // Conteúdo contém query
  if (contentLower.includes(queryLower)) score += 20;
  
  // Tags match
  if (article.tags?.some((tag: string) => tag.toLowerCase().includes(queryLower))) {
    score += 30;
  }
  
  // Boost por popularidade
  score += Math.min(article.views || 0, 20);
  
  return score;
}
