import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Generate AI Insights
 * AWS Lambda Handler for generate-ai-insights
 * 
 * Gera insights usando IA baseado em dados históricos
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';

interface GenerateAIInsightsRequest {
  accountId?: string;
  insightType?: 'cost' | 'security' | 'performance' | 'all';
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Generate AI Insights started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const body: GenerateAIInsightsRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, insightType = 'all' } = body;
    
    const prisma = getPrismaClient();
    
    const insights: any[] = [];
    
    // Cost Insights
    if (insightType === 'cost' || insightType === 'all') {
      const costInsights = await generateCostInsights(prisma, organizationId, accountId);
      insights.push(...costInsights);
    }
    
    // Security Insights
    if (insightType === 'security' || insightType === 'all') {
      const securityInsights = await generateSecurityInsights(prisma, organizationId, accountId);
      insights.push(...securityInsights);
    }
    
    // Performance Insights
    if (insightType === 'performance' || insightType === 'all') {
      const performanceInsights = await generatePerformanceInsights(prisma, organizationId, accountId);
      insights.push(...performanceInsights);
    }
    
    // Ordenar por prioridade
    insights.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority as keyof typeof priorityOrder] - 
             priorityOrder[b.priority as keyof typeof priorityOrder];
    });
    
    logger.info(`✅ Generated ${insights.length} AI insights`);
    
    return success({
      success: true,
      insights,
      summary: {
        total: insights.length,
        critical: insights.filter(i => i.priority === 'critical').length,
        high: insights.filter(i => i.priority === 'high').length,
        medium: insights.filter(i => i.priority === 'medium').length,
        low: insights.filter(i => i.priority === 'low').length,
      },
    });
    
  } catch (err) {
    logger.error('❌ Generate AI Insights error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

async function generateCostInsights(
  prisma: any,
  organizationId: string,
  accountId?: string
): Promise<any[]> {
  const insights: any[] = [];
  
  // Analisar custos dos últimos 30 dias
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const costs = await prisma.dailyCost.groupBy({
    by: ['service'],
    where: {
      organizationId,
      ...(accountId && { accountId }),
      date: { gte: thirtyDaysAgo },
    },
    _sum: { cost: true },
    orderBy: { _sum: { cost: 'desc' } },
    take: 5,
  });
  
  if (costs.length > 0) {
    const topService = costs[0];
    const totalCost = costs.reduce((sum: number, c: any) => sum + (c._sum.cost || 0), 0);
    const topServicePercentage = ((topService._sum.cost || 0) / totalCost) * 100;
    
    if (topServicePercentage > 50) {
      insights.push({
        type: 'cost',
        priority: 'high',
        title: 'High Cost Concentration',
        description: `${topService.service} represents ${topServicePercentage.toFixed(1)}% of your total costs`,
        recommendation: 'Consider optimizing this service or diversifying your infrastructure',
        impact: 'high',
      });
    }
  }
  
  return insights;
}

async function generateSecurityInsights(
  prisma: any,
  organizationId: string,
  accountId?: string
): Promise<any[]> {
  const insights: any[] = [];
  
  // Analisar findings críticos
  const criticalFindings = await prisma.finding.count({
    where: {
      organizationId,
      ...(accountId && { accountId }),
      severity: 'CRITICAL',
      status: 'ACTIVE',
    },
  });
  
  if (criticalFindings > 0) {
    insights.push({
      type: 'security',
      priority: 'critical',
      title: 'Critical Security Findings',
      description: `You have ${criticalFindings} critical security findings that need immediate attention`,
      recommendation: 'Review and remediate critical findings as soon as possible',
      impact: 'critical',
    });
  }
  
  return insights;
}

async function generatePerformanceInsights(
  prisma: any,
  organizationId: string,
  accountId?: string
): Promise<any[]> {
  const insights: any[] = [];
  
  // Analisar waste detection
  const wasteItems = await prisma.wasteDetection.count({
    where: {
      organizationId,
      ...(accountId && { accountId }),
      wasteType: 'zombie',
    },
  });
  
  if (wasteItems > 0) {
    insights.push({
      type: 'performance',
      priority: 'medium',
      title: 'Zombie Resources Detected',
      description: `Found ${wasteItems} zombie resources that are consuming costs without providing value`,
      recommendation: 'Review and terminate unused resources',
      impact: 'medium',
    });
  }
  
  return insights;
}
