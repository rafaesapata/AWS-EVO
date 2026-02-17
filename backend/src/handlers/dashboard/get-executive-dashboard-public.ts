/**
 * Executive Dashboard Public - For TV Mode
 * Public endpoint that accepts organizationId directly (no auth required)
 * Used by TV Dashboard displays
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, badRequest } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { getOrigin } from '../../lib/middleware.js';
import { z } from 'zod';

// Validation schema - organizationId is required for public endpoint
const requestSchema = z.object({
  organizationId: z.string().uuid(),
  includeForecasts: z.boolean().default(true),
  includeTrends: z.boolean().default(true),
  includeInsights: z.boolean().default(true),
  trendPeriod: z.enum(['7d', '30d', '90d']).default('30d')
});

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions(origin);
  }

  const startTime = Date.now();

  try {
    // Validate input - organizationId comes from body (not auth)
    const body = event.body ? JSON.parse(event.body) : {};
    const params = requestSchema.parse(body);
    const { organizationId } = params;

    logger.info('Executive Dashboard Public request', {
      organizationId,
      params,
      requestId: context.awsRequestId
    });

    const prisma = getPrismaClient();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Execute queries in parallel
    const [financialData, securityData, operationsData] = await Promise.all([
      getFinancialData(prisma, organizationId, startOfMonth, startOfYear),
      getSecurityData(prisma, organizationId),
      getOperationsData(prisma, organizationId)
    ]);

    // Calculate summary
    const summary = calculateExecutiveSummary(financialData, securityData, operationsData);

    // Build response
    const response = {
      summary,
      financial: financialData,
      security: securityData,
      operations: operationsData,
      insights: [],
      trends: null,
      metadata: {
        generatedAt: now.toISOString(),
        dataFreshness: {
          costs: financialData.lastCostUpdate,
          security: securityData.lastScanDate,
          endpoints: operationsData.lastCheckDate
        },
        organizationId,
        accountId: 'all',
        trendPeriod: params.trendPeriod
      }
    };

    const executionTime = Date.now() - startTime;
    logger.info('Executive Dashboard Public generated', {
      organizationId,
      overallScore: summary.overallScore,
      executionTime
    });

    return success(response, 200, origin);

  } catch (err) {
    logger.error('Executive Dashboard Public error', err as Error);
    
    if (err instanceof z.ZodError) {
      return badRequest('Invalid request parameters', undefined, origin);
    }
    
    return error('Unable to load dashboard data', 500, undefined, origin);
  }
}

// Simplified data functions
async function getFinancialData(prisma: any, organizationId: string, startOfMonth: Date, startOfYear: Date) {
  const baseFilter = { organization_id: organizationId };

  const latestCost = await prisma.dailyCost.findFirst({
    where: baseFilter,
    orderBy: { date: 'desc' },
    select: { date: true }
  });

  const mtdCosts = await prisma.dailyCost.aggregate({
    where: { ...baseFilter, date: { gte: startOfMonth } },
    _sum: { cost: true }
  });

  const ytdCosts = await prisma.dailyCost.aggregate({
    where: { ...baseFilter, date: { gte: startOfYear } },
    _sum: { cost: true }
  });

  const topServices = await prisma.dailyCost.groupBy({
    by: ['service'],
    where: { ...baseFilter, date: { gte: startOfMonth } },
    _sum: { cost: true },
    orderBy: { _sum: { cost: 'desc' } },
    take: 5
  });

  // Cost optimizations from cost_optimizations table
  let costOptimizations = { _sum: { potential_savings: 0 }, _count: 0 };
  try {
    costOptimizations = await prisma.costOptimization.aggregate({
      where: { 
        organization_id: organizationId,
        status: { in: ['pending', 'active'] }
      },
      _sum: { potential_savings: true },
      _count: true
    });
  } catch { /* table might not exist */ }

  // RI/SP recommendations from ri_sp_recommendations table
  let riSpRecommendations = { _sum: { estimated_monthly_savings: 0 }, _count: 0 };
  try {
    riSpRecommendations = await prisma.riSpRecommendation.aggregate({
      where: { 
        organization_id: organizationId,
        status: { in: ['active', 'pending'] }
      },
      _sum: { estimated_monthly_savings: true },
      _count: true
    });
  } catch { /* table might not exist */ }

  const mtdTotal = Number(mtdCosts._sum.cost || 0);

  // Buscar budget real da tabela cloud_budgets
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let budgetAmount = mtdTotal > 0 ? mtdTotal * 1.2 : 10000;
  try {
    const budget = await prisma.cloudBudget.findUnique({
      where: {
        organization_id_cloud_provider_year_month: {
          organization_id: organizationId,
          cloud_provider: 'AWS',
          year_month: currentYearMonth,
        },
      },
    });
    if (budget) budgetAmount = budget.amount;
  } catch { /* table might not exist yet */ }

  const costRecommendationsValue = Number(costOptimizations._sum?.potential_savings || 0);
  const riSpRecommendationsValue = Number(riSpRecommendations._sum?.estimated_monthly_savings || 0);

  return {
    mtdCost: mtdTotal,
    ytdCost: Number(ytdCosts._sum.cost || 0),
    credits: 0,
    netCost: mtdTotal,
    budget: budgetAmount,
    budgetUtilization: budgetAmount > 0 ? (mtdTotal / budgetAmount) * 100 : 0,
    topServices: topServices.map((item: any, index: number) => ({
      service: item.service || 'Unknown',
      cost: Number(item._sum.cost || 0),
      percentage: mtdTotal > 0 ? (Number(item._sum.cost || 0) / mtdTotal) * 100 : 0,
      rank: index + 1
    })),
    savings: { 
      potential: costRecommendationsValue + riSpRecommendationsValue, 
      costRecommendations: costRecommendationsValue, 
      riSpRecommendations: riSpRecommendationsValue, 
      recommendationsCount: (costOptimizations._count || 0) + (riSpRecommendations._count || 0)
    },
    lastCostUpdate: latestCost?.date?.toISOString() || null
  };
}

async function getSecurityData(prisma: any, organizationId: string) {
  const lastScan = await prisma.securityScan.findFirst({
    where: { organization_id: organizationId },
    orderBy: { started_at: 'desc' },
    select: { completed_at: true }
  });

  if (!lastScan) {
    return {
      score: -1,
      findings: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      trend: { newLast7Days: 0, resolvedLast7Days: 0, netChange: 0 },
      mttr: { critical: 0, high: 0, medium: 0, low: 0, average: 0 },
      lastScanDate: null
    };
  }

  const findingsBySeverity = await prisma.finding.groupBy({
    by: ['severity'],
    where: { organization_id: organizationId, status: { in: ['new', 'active', 'reopened', 'pending', 'ACTIVE', 'PENDING'] } },
    _count: true
  });

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  findingsBySeverity.forEach((f: any) => {
    const severity = f.severity?.toLowerCase() || '';
    if (severity in counts) counts[severity as keyof typeof counts] = f._count;
  });

  const totalFindings = Object.values(counts).reduce((a, b) => a + b, 0);
  let securityScore = 100;
  if (totalFindings > 0) {
    const weightedScore = (counts.critical * 10) + (counts.high * 5) + (counts.medium * 2) + (counts.low * 0.5);
    securityScore = Math.max(0, Math.round(100 - (weightedScore / (totalFindings * 10) * 100)));
  }

  return {
    score: securityScore,
    findings: { ...counts, total: totalFindings },
    trend: { newLast7Days: 0, resolvedLast7Days: 0, netChange: 0 },
    mttr: { critical: 0, high: 0, medium: 0, low: 0, average: 0 },
    lastScanDate: lastScan.completed_at?.toISOString() || null
  };
}

async function getOperationsData(prisma: any, organizationId: string) {
  let monitors: any[] = [];
  try {
    monitors = await prisma.monitoredEndpoint.findMany({
      where: { organization_id: organizationId, is_active: true },
      select: { id: true, last_status: true, last_checked_at: true, last_response_time: true }
    });
  } catch { monitors = []; }

  const stats = { total: monitors.length, healthy: 0, degraded: 0, down: 0 };
  let totalResponseTime = 0, responseTimeCount = 0;

  monitors.forEach((m: any) => {
    if (m.last_status === 'down') stats.down++;
    else if (m.last_status === 'degraded') stats.degraded++;
    else stats.healthy++;
    if (m.last_response_time > 0) { totalResponseTime += m.last_response_time; responseTimeCount++; }
  });

  const uptime = stats.total > 0 ? ((stats.healthy + stats.degraded * 0.5) / stats.total) * 100 : 0;

  return {
    endpoints: stats,
    uptime: { current: Math.round(uptime * 10) / 10, target: 99.9 },
    responseTime: { avg: responseTimeCount > 0 ? Math.round(totalResponseTime / responseTimeCount) : 0 },
    alerts: { active: [], count: { critical: 0, high: 0 } },
    remediations: { pending: 0, inProgress: 0, resolved: 0, total: 0 },
    lastCheckDate: monitors[0]?.last_checked_at?.toISOString() || null
  };
}

function calculateExecutiveSummary(financial: any, security: any, operations: any) {
  const financialScore = Math.max(0, 100 - (financial.budgetUtilization - 80));
  
  // Operational score - treat "no endpoints" as neutral (not penalizing)
  const hasEndpoints = operations.endpoints.total > 0;
  const operationalScore = hasEndpoints ? operations.uptime.current : -1;
  
  const hasSecurityData = security.score !== -1;
  const hasOperationalData = hasEndpoints;
  const securityScore = security.score === -1 ? -1 : security.score;
  
  let overallScore: number;
  if (!hasSecurityData && !hasOperationalData) {
    overallScore = Math.round(Math.min(100, financialScore));
  } else if (!hasSecurityData) {
    overallScore = Math.round(
      (Math.min(100, financialScore) * 0.5) + (operationalScore * 0.5)
    );
  } else if (!hasOperationalData) {
    overallScore = Math.round(
      (securityScore * 0.5) + (Math.min(100, financialScore) * 0.5)
    );
  } else {
    overallScore = Math.round(
      (securityScore * 0.4) + (Math.min(100, financialScore) * 0.3) + (operationalScore * 0.3)
    );
  }

  return {
    overallScore,
    scoreChange: 0,
    mtdSpend: financial.mtdCost,
    budget: financial.budget,
    budgetUtilization: financial.budgetUtilization,
    potentialSavings: financial.savings.potential,
    uptimeSLA: operations.uptime.current,
    activeAlerts: {
      critical: security.findings.critical + operations.alerts.count.critical,
      high: security.findings.high + operations.alerts.count.high,
      medium: security.findings.medium
    }
  };
}
