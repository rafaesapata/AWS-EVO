import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for KB Analytics Dashboard
 * AWS Lambda Handler for kb-analytics-dashboard
 * 
 * Retorna analytics da knowledge base
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 KB Analytics Dashboard started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const prisma = getPrismaClient();
    
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
    
    const tagCounts: Record<string, number> = {};
    allArticles.forEach(article => {
      article.tags?.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    
    const topTags = Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
    
    logger.info(`✅ KB Analytics: ${totalArticles} articles, ${totalViews._sum?.views || 0} views`);
    
    return success({
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
    
  } catch (err) {
    logger.error('❌ KB Analytics Dashboard error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
