/**
 * Executive Dashboard - Consolidated API Handler
 * Single endpoint that returns all dashboard data aggregated
 * Reduces frontend queries from 8 to 1
 * 
 * DEMO MODE: Suporta modo demonstração para organizações com demo_mode=true
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, badRequest } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { getOrigin } from '../../lib/middleware.js';
import { isOrganizationInDemoMode, generateDemoExecutiveDashboard } from '../../lib/demo-data-service.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { cacheManager } from '../../lib/redis-cache.js';
import { applyOverhead, type OverheadFieldConfig } from '../../lib/cost-overhead.js';
import { z } from 'zod';

const EXEC_DASHBOARD_OVERHEAD_FIELDS: OverheadFieldConfig[] = [
  { path: 'financial', type: 'object', fields: ['mtdCost', 'ytdCost', 'netCost', 'budget'] },
  { path: 'financial.topServices', type: 'array', fields: ['cost'] },
  { path: 'financial.savings', type: 'object', fields: ['potential', 'costRecommendations', 'riSpRecommendations'] },
  { path: 'summary', type: 'object', fields: ['mtdSpend', 'budget', 'potentialSavings'] },
];

// ============================================================================
// TYPES
// ============================================================================

interface ExecutiveSummary {
  overallScore: number;
  scoreChange: number;
  mtdSpend: number;
  budget: number;
  budgetUtilization: number;
  budgetSource?: string;
  potentialSavings: number;
  uptimeSLA: number;
  activeAlerts: {
    critical: number;
    high: number;
    medium: number;
  };
}

interface FinancialHealth {
  mtdCost: number;
  ytdCost: number;
  credits: number;
  netCost: number;
  budget: number;
  budgetUtilization: number;
  budgetSource?: string;
  topServices: Array<{
    service: string;
    cost: number;
    percentage: number;
    rank: number;
  }>;
  savings: {
    potential: number;
    costRecommendations: number;
    riSpRecommendations: number;
    recommendationsCount: number;
  };
  lastCostUpdate: string | null;
}

interface SecurityPosture {
  score: number;
  findings: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  trend: {
    newLast7Days: number;
    resolvedLast7Days: number;
    netChange: number;
  };
  mttr: Record<string, number>;
  lastScanDate: string | null;
}

interface OperationsCenter {
  endpoints: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
  };
  uptime: {
    current: number;
    target: number;
  };
  responseTime: {
    avg: number;
  };
  alerts: {
    active: Array<{
      id: string;
      severity: string;
      title: string;
      since: Date;
    }>;
    count: {
      critical: number;
      high: number;
    };
  };
  remediations: {
    pending: number;
    inProgress: number;
    resolved: number;
    total: number;
  };
  lastCheckDate: string | null;
}

interface AIInsight {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string | null;
  confidence: number;
  generatedAt: Date;
}

interface TrendData {
  cost: Array<{
    date: string;
    cost: number;
    credits: number;
    net: number;
  }>;
  security: Array<{
    date: string;
    score: number;
    findings: number;
  }>;
  period: string;
}

interface DashboardMetadata {
  generatedAt: string;
  dataFreshness: {
    costs: string | null;
    security: string | null;
    endpoints: string | null;
  };
  organizationId: string;
  accountId: string;
  trendPeriod: string;
}

interface ExecutiveDashboardResponse {
  summary: ExecutiveSummary;
  financial: FinancialHealth;
  security: SecurityPosture;
  operations: OperationsCenter;
  insights: AIInsight[];
  trends: TrendData | null;
  metadata: DashboardMetadata;
}

// ============================================================================
// VALIDATION
// ============================================================================

const requestSchema = z.object({
  accountId: z.string().uuid().optional().nullable(),
  provider: z.enum(['AWS', 'AZURE']).optional().nullable(), // Cloud provider for the selected account
  includeForecasts: z.boolean().default(true),
  includeTrends: z.boolean().default(true),
  includeInsights: z.boolean().default(true),
  trendPeriod: z.enum(['7d', '30d', '90d']).default('30d')
});

// ============================================================================
// HANDLER
// ============================================================================

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
    // 1. Authentication
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const userId = user.sub;

    // 2. Validate input using centralized validation
    const validation = parseAndValidateBody(requestSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    const params = validation.data;

    logger.info('Executive Dashboard request', {
      organizationId,
      userId,
      params,
      requestId: context.awsRequestId
    });

    const prisma = getPrismaClient();

    // 3. Check for Demo Mode (FAIL-SAFE: returns false on any error)
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    
    if (isDemo === true) {
      // Return demo data for organizations in demo mode
      logger.info('Returning demo executive dashboard', {
        organizationId,
        isDemo: true,
        requestId: context.awsRequestId
      });
      
      const demoData = generateDemoExecutiveDashboard();
      const executionTime = Date.now() - startTime;
      
      logger.info('Demo Executive Dashboard generated', {
        organizationId,
        overallScore: demoData.summary.overallScore,
        executionTime,
        isDemo: true,
        requestId: context.awsRequestId
      });
      
      const demoWithOverhead = await applyOverhead(organizationId, { ...demoData, _isDemo: true }, EXEC_DASHBOARD_OVERHEAD_FIELDS);
      return success(demoWithOverhead, 200, origin);
    }

    // 4. SWR Cache - return cached data instantly if fresh
    const cacheKey = `exec:${organizationId}:${params.accountId || 'all'}:${params.provider || 'all'}:${params.trendPeriod || '30d'}`;
    const cached = await cacheManager.getSWR<ExecutiveDashboardResponse>(cacheKey, { prefix: 'dash' });
    if (cached && !cached.stale) {
      logger.info('Executive Dashboard cache hit (fresh)', { organizationId, cacheAge: cached.age });
      const cachedWithOverhead = await applyOverhead(organizationId, { ...cached.data, _fromCache: true, _cacheAge: cached.age }, EXEC_DASHBOARD_OVERHEAD_FIELDS);
      return success(cachedWithOverhead, 200, origin);
    }

    // 5. Real data flow - Execute queries in parallel for performance
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    
    // Determine provider from request or detect from account
    let provider = params.provider;
    if (!provider && params.accountId) {
      // Try to detect provider by checking if accountId exists in azure_credentials
      const azureCredential = await prisma.azureCredential.findFirst({
        where: { id: params.accountId, organization_id: organizationId },
        select: { id: true }
      });
      provider = azureCredential ? 'AZURE' : 'AWS';
    }

    const [
      financialData,
      securityData,
      operationsData,
      insightsData,
      trendsData
    ] = await Promise.all([
      getFinancialData(prisma, organizationId, params.accountId || undefined, startOfMonth, startOfYear, provider || undefined),
      getSecurityData(prisma, organizationId, params.accountId || undefined, provider || undefined),
      getOperationsData(prisma, organizationId),
      params.includeInsights ? getInsightsData(prisma, organizationId, params.accountId || undefined, provider || undefined) : Promise.resolve([]),
      params.includeTrends ? getTrendsData(prisma, organizationId, params.trendPeriod ?? '30d', params.accountId ?? undefined, provider || undefined) : Promise.resolve(null)
    ]);

    // 6. Calculate aggregated scores
    const summary = calculateExecutiveSummary(financialData, securityData, operationsData);

    // 7. Build response
    const response: ExecutiveDashboardResponse = {
      summary,
      financial: financialData,
      security: securityData,
      operations: operationsData,
      insights: insightsData,
      trends: trendsData,
      metadata: {
        generatedAt: now.toISOString(),
        dataFreshness: {
          costs: financialData.lastCostUpdate,
          security: securityData.lastScanDate,
          endpoints: operationsData.lastCheckDate
        },
        organizationId,
        accountId: params.accountId ?? 'all',
        trendPeriod: params.trendPeriod ?? '30d'
      }
    };

    // 8. Save to SWR cache (freshFor: 120s = 2min, maxTTL: 24h)
    await cacheManager.setSWR(cacheKey, response, { prefix: 'dash', freshFor: 120, maxTTL: 86400 });

    const responseWithOverhead = await applyOverhead(organizationId, response, EXEC_DASHBOARD_OVERHEAD_FIELDS);

    const executionTime = Date.now() - startTime;
    logger.info('Executive Dashboard generated', {
      organizationId,
      overallScore: summary.overallScore,
      executionTime,
      requestId: context.awsRequestId
    });

    return success(responseWithOverhead, 200, origin);

  } catch (err) {
    logger.error('Executive Dashboard error', err as Error, {
      requestId: context.awsRequestId
    });
    
    if (err instanceof z.ZodError) {
      return badRequest('Invalid request parameters', undefined, origin);
    }
    
    // Never expose internal error details to the client
    return error(
      'Unable to load dashboard data. Please try again later.',
      500,
      undefined,
      origin
    );
  }
}


// ============================================================================
// DATA FUNCTIONS
// ============================================================================

async function getFinancialData(
  prisma: any,
  organizationId: string,
  accountId: string | undefined,
  startOfMonth: Date,
  startOfYear: Date,
  provider?: string
): Promise<FinancialHealth> {
  const now = new Date();
  
  // Base filter for tables WITH azure_credential_id (DailyCost, etc.)
  const baseFilter: any = { organization_id: organizationId };
  
  // Filter by specific account if provided, using correct field based on provider
  if (accountId) {
    if (provider === 'AZURE') {
      baseFilter.azure_credential_id = accountId;
    } else {
      baseFilter.aws_account_id = accountId;
    }
  }
  
  // Filter for tables WITHOUT azure_credential_id (CostOptimization, RiSpRecommendation)
  // These tables only have aws_account_id, so for Azure we filter only by organization
  const awsOnlyFilter: any = { organization_id: organizationId };
  if (accountId && provider !== 'AZURE') {
    awsOnlyFilter.aws_account_id = accountId;
  }

  // Get the most recent cost date first
  const latestCost = await prisma.dailyCost.findFirst({
    where: baseFilter,
    orderBy: { date: 'desc' },
    select: { date: true }
  });

  // MTD costs aggregation - using correct column names (date, cost)
  const mtdCosts = await prisma.dailyCost.aggregate({
    where: {
      ...baseFilter,
      date: { gte: startOfMonth }
    },
    _sum: {
      cost: true
    }
  });

  // YTD costs aggregation
  const ytdCosts = await prisma.dailyCost.aggregate({
    where: {
      ...baseFilter,
      date: { gte: startOfYear }
    },
    _sum: {
      cost: true
    }
  });

  // Top 5 services by cost (MTD)
  const topServices = await prisma.dailyCost.groupBy({
    by: ['service'],
    where: {
      ...baseFilter,
      date: { gte: startOfMonth }
    },
    _sum: {
      cost: true
    },
    orderBy: {
      _sum: {
        cost: 'desc'
      }
    },
    take: 5
  });

  // Cost optimizations from cost_optimizations table
  // Note: This table doesn't have azure_credential_id, so use awsOnlyFilter
  let costOptimizationsSum = 0;
  let costOptimizationsCount = 0;
  try {
    const costOptResult = await prisma.costOptimization.aggregate({
      where: { 
        ...awsOnlyFilter,
        status: { in: ['pending', 'active'] }
      },
      _sum: { potential_savings: true },
      _count: { _all: true }
    });
    costOptimizationsSum = Number(costOptResult._sum?.potential_savings || 0);
    costOptimizationsCount = costOptResult._count?._all || 0;
    logger.info('Cost optimizations aggregated', { 
      sum: costOptimizationsSum, 
      count: costOptimizationsCount,
      accountId: accountId || 'all'
    });
  } catch (err) {
    logger.warn('Could not aggregate cost_optimizations', { error: (err as Error).message });
  }

  // RI/SP recommendations from ri_sp_recommendations table
  // Note: This table doesn't have azure_credential_id, so use awsOnlyFilter
  let riSpRecommendationsSum = 0;
  let riSpRecommendationsCount = 0;
  try {
    const riSpResult = await prisma.riSpRecommendation.aggregate({
      where: { 
        ...awsOnlyFilter,
        status: { in: ['active', 'pending'] }
      },
      _sum: { estimated_monthly_savings: true },
      _count: { _all: true }
    });
    riSpRecommendationsSum = Number(riSpResult._sum?.estimated_monthly_savings || 0);
    riSpRecommendationsCount = riSpResult._count?._all || 0;
    logger.info('RI/SP recommendations aggregated', { 
      sum: riSpRecommendationsSum, 
      count: riSpRecommendationsCount,
      accountId: accountId || 'all'
    });
  } catch (err) {
    logger.warn('Could not aggregate ri_sp_recommendations', { error: (err as Error).message });
  }

  const mtdTotal = Number(mtdCosts._sum.cost || 0);

  // Buscar budget real da tabela cloud_budgets
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let budgetAmount = 0;
  let budgetSource: string = 'fallback';
  try {
    const budget = await prisma.cloudBudget.findFirst({
      where: {
        organization_id: organizationId,
        cloud_provider: provider || 'AWS',
        year_month: currentYearMonth,
      },
    });
    if (budget) {
      budgetAmount = budget.amount;
      budgetSource = budget.source;
    } else {
      // Fallback: auto-fill com 85% do mês anterior se não existe budget
      const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
      const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const prevYearMonth = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
      const prevStart = new Date(prevYear, prevMonth - 1, 1);
      const prevEnd = new Date(prevYear, prevMonth, 0);
      const prevCosts = await prisma.dailyCost.aggregate({
        where: { ...baseFilter, date: { gte: prevStart, lte: prevEnd } },
        _sum: { cost: true },
      });
      const prevTotal = Number(prevCosts._sum?.cost || 0);
      if (prevTotal > 0) {
        budgetAmount = Math.round(prevTotal * 0.85 * 100) / 100;
        budgetSource = 'auto';
        // Salvar auto-fill para próximas consultas
        try {
          await prisma.cloudBudget.create({
            data: {
              organization_id: organizationId,
              cloud_provider: provider || 'AWS',
              year_month: currentYearMonth,
              amount: budgetAmount,
              source: 'auto',
            },
          });
        } catch { /* unique constraint - já existe */ }
      } else {
        budgetAmount = mtdTotal > 0 ? mtdTotal * 1.2 : 10000;
      }
    }
  } catch {
    budgetAmount = mtdTotal > 0 ? mtdTotal * 1.2 : 10000;
  }

  const sortedServices = topServices.map((item: any, index: number) => ({
    service: item.service || 'Unknown',
    cost: Number(item._sum.cost || 0),
    percentage: mtdTotal > 0 ? (Number(item._sum.cost || 0) / mtdTotal) * 100 : 0,
    rank: index + 1
  }));

  // Use the latest cost date for lastCostUpdate
  const lastCostDate = latestCost?.date;

  return {
    mtdCost: mtdTotal,
    ytdCost: Number(ytdCosts._sum.cost || 0),
    credits: 0, // No credits column in current schema
    netCost: mtdTotal,
    budget: budgetAmount,
    budgetUtilization: budgetAmount > 0 ? (mtdTotal / budgetAmount) * 100 : 0,
    budgetSource,
    topServices: sortedServices,
    savings: {
      potential: costOptimizationsSum + riSpRecommendationsSum,
      costRecommendations: costOptimizationsSum,
      riSpRecommendations: riSpRecommendationsSum,
      recommendationsCount: costOptimizationsCount + riSpRecommendationsCount
    },
    lastCostUpdate: lastCostDate ? lastCostDate.toISOString() : null
  };
}

async function getSecurityData(
  prisma: any,
  organizationId: string,
  accountId?: string,
  provider?: string
): Promise<SecurityPosture> {
  
  // Base filter - by organization and optionally by account (AWS or Azure)
  const baseFilter: any = { organization_id: organizationId };
  if (accountId) {
    if (provider === 'AZURE') {
      baseFilter.azure_credential_id = accountId;
    } else {
      baseFilter.aws_account_id = accountId;
    }
  }
  
  // For security scans, also check by cloud_provider if filtering by account
  const scanFilter: any = { organization_id: organizationId };
  if (accountId) {
    if (provider === 'AZURE') {
      scanFilter.azure_credential_id = accountId;
      scanFilter.cloud_provider = 'AZURE';
    } else {
      scanFilter.aws_account_id = accountId;
      scanFilter.cloud_provider = 'AWS';
    }
  }
  
  // Check if any security scans have been performed
  const lastScan = await prisma.securityScan.findFirst({
    where: scanFilter,
    orderBy: { started_at: 'desc' },
    select: { completed_at: true }
  });

  // If no scans have been performed, return "no data" state
  if (!lastScan) {
    return {
      score: -1, // Special value to indicate no data
      findings: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        total: 0
      },
      trend: {
        newLast7Days: 0,
        resolvedLast7Days: 0,
        netChange: 0
      },
      mttr: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        average: 0
      },
      lastScanDate: null
    };
  }

  // Count by severity (optimized with groupBy)
  const findingsBySeverity = await prisma.finding.groupBy({
    by: ['severity'],
    where: {
      ...baseFilter,
      status: { in: ['new', 'active', 'reopened', 'pending', 'ACTIVE', 'PENDING'] }
    },
    _count: true
  });

  // Convert to object
  const counts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };
  
  findingsBySeverity.forEach((f: any) => {
    const severity = f.severity?.toLowerCase() || '';
    if (severity in counts) {
      counts[severity as keyof typeof counts] = f._count;
    }
  });

  const totalFindings = Object.values(counts).reduce((a, b) => a + b, 0);

  // Calculate security score (normalized)
  // If no findings, score is 100 (perfect), otherwise calculate based on severity
  let securityScore = 100;
  if (totalFindings > 0) {
    const weightedScore = (counts.critical * 10) + (counts.high * 5) +
                          (counts.medium * 2) + (counts.low * 0.5);
    const maxPossibleScore = totalFindings * 10;
    securityScore = Math.max(0, Math.round(100 - (weightedScore / maxPossibleScore * 100)));
  }

  // Findings resolved vs new (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const [newFindings, resolvedFindings] = await Promise.all([
    prisma.finding.count({
      where: {
        ...baseFilter,
        created_at: { gte: sevenDaysAgo }
      }
    }),
    prisma.finding.count({
      where: {
        ...baseFilter,
        status: { in: ['resolved', 'RESOLVED'] },
        updated_at: { gte: sevenDaysAgo }
      }
    })
  ]);

  return {
    score: securityScore,
    findings: {
      ...counts,
      total: totalFindings
    },
    trend: {
      newLast7Days: newFindings,
      resolvedLast7Days: resolvedFindings,
      netChange: newFindings - resolvedFindings
    },
    mttr: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      average: 0
    },
    lastScanDate: lastScan.completed_at?.toISOString() || null
  };
}

async function getOperationsData(
  prisma: any,
  organizationId: string
): Promise<OperationsCenter> {
  
  // Endpoint monitors - use MonitoredEndpoint table
  let monitors: any[] = [];
  try {
    monitors = await prisma.monitoredEndpoint.findMany({
      where: {
        organization_id: organizationId,
        is_active: true
      },
      select: {
        id: true,
        url: true,
        last_status: true,
        last_checked_at: true,
        last_response_time: true
      }
    });
  } catch {
    monitors = [];
  }

  const endpointStats = {
    total: monitors.length,
    healthy: 0,
    degraded: 0,
    down: 0
  };

  let totalResponseTime = 0;
  let responseTimeCount = 0;

  monitors.forEach((m: any) => {
    const failures = m.consecutive_failures || 0;
    const threshold = m.alert_threshold || 3;
    const status = m.last_status;
    
    if (failures >= threshold || status === 'down') {
      endpointStats.down++;
    } else if (failures > 0 || status === 'degraded') {
      endpointStats.degraded++;
    } else {
      endpointStats.healthy++;
    }

    const responseTime = m.avg_response_time || m.last_response_time || 0;
    if (responseTime > 0) {
      totalResponseTime += responseTime;
      responseTimeCount++;
    }
  });

  // Calculate uptime - 0 when no endpoints are monitored (showing 100% with nothing monitored is misleading)
  const uptime = endpointStats.total > 0 
    ? ((endpointStats.healthy + endpointStats.degraded * 0.5) / endpointStats.total) * 100
    : 0;

  // Active alerts
  let activeAlerts: any[] = [];
  try {
    activeAlerts = await prisma.alert.findMany({
      where: {
        organization_id: organizationId,
        resolved_at: null,
        severity: { in: ['CRITICAL', 'HIGH', 'critical', 'high'] }
      },
      orderBy: { triggered_at: 'desc' },
      take: 10
    });
  } catch {
    activeAlerts = [];
  }

  // Remediation stats - use RemediationTicket table
  let remediationStats: any[] = [];
  try {
    remediationStats = await prisma.remediationTicket.groupBy({
      by: ['status'],
      where: { organization_id: organizationId },
      _count: true
    });
  } catch {
    // Fallback to SecurityAlert if RemediationTicket table doesn't exist
    try {
      const alertStats = await prisma.securityAlert.groupBy({
        by: ['is_resolved'],
        where: { organization_id: organizationId },
        _count: true
      });
      remediationStats = alertStats.map((r: any) => ({
        status: r.is_resolved ? 'resolved' : 'open',
        _count: r._count
      }));
    } catch {
      remediationStats = [];
    }
  }

  const remediations = {
    pending: 0,
    inProgress: 0,
    resolved: 0,
    total: 0
  };

  remediationStats.forEach((r: any) => {
    const count = r._count?._all || r._count || 0;
    switch (r.status) {
      case 'open':
        remediations.pending += count;
        break;
      case 'in_progress':
        remediations.inProgress += count;
        break;
      case 'resolved':
      case 'closed':
        remediations.resolved += count;
        break;
      // cancelled tickets are not counted
    }
    if (r.status !== 'cancelled') {
      remediations.total += count;
    }
  });

  const lastCheckDate = monitors.length > 0 
    ? (monitors[0].last_check_at || monitors[0].last_checked_at)?.toISOString()
    : null;

  return {
    endpoints: endpointStats,
    uptime: {
      current: Math.round(uptime * 10) / 10,
      target: 99.9
    },
    responseTime: {
      avg: responseTimeCount > 0 ? Math.round(totalResponseTime / responseTimeCount) : 0
    },
    alerts: {
      active: activeAlerts.map((a: any) => ({
        id: a.id,
        severity: a.severity,
        title: a.title,
        since: a.triggered_at || a.created_at
      })),
      count: {
        critical: activeAlerts.filter((a: any) => 
          a.severity?.toLowerCase() === 'critical').length,
        high: activeAlerts.filter((a: any) => 
          a.severity?.toLowerCase() === 'high').length
      }
    },
    remediations,
    lastCheckDate
  };
}

async function getInsightsData(
  prisma: any,
  organizationId: string,
  accountId?: string,
  provider?: string
): Promise<AIInsight[]> {
  const insights: AIInsight[] = [];
  const now = new Date();
  const currencySymbol = provider === 'AZURE' ? 'R$' : '$';
  
  // Base filter - by organization and optionally by account (AWS or Azure)
  const baseFilter: any = { organization_id: organizationId };
  if (accountId) {
    if (provider === 'AZURE') {
      baseFilter.azure_credential_id = accountId;
    } else {
      baseFilter.aws_account_id = accountId;
    }
  }

  try {
    // 1. Check for critical security findings
    const criticalFindings = await prisma.finding.count({
      where: {
        ...baseFilter,
        severity: { in: ['critical', 'CRITICAL'] },
        status: { in: ['new', 'active', 'reopened', 'pending', 'ACTIVE', 'PENDING'] }
      }
    });

    if (criticalFindings > 0) {
      insights.push({
        id: `insight-security-critical-${now.getTime()}`,
        type: 'security_risk',
        severity: 'critical',
        title: `${criticalFindings} vulnerabilidade(s) crítica(s) detectada(s)`,
        description: `Existem ${criticalFindings} findings de segurança com severidade crítica que requerem atenção imediata.`,
        recommendation: 'Execute um scan de segurança e priorize a remediação dos findings críticos.',
        confidence: 0.95,
        generatedAt: now
      });
    }

    // 2. Check for high findings
    const highFindings = await prisma.finding.count({
      where: {
        ...baseFilter,
        severity: { in: ['high', 'HIGH'] },
        status: { in: ['new', 'active', 'reopened', 'pending', 'ACTIVE', 'PENDING'] }
      }
    });

    if (highFindings > 5) {
      insights.push({
        id: `insight-security-high-${now.getTime()}`,
        type: 'security_risk',
        severity: 'warning',
        title: `${highFindings} findings de alta severidade pendentes`,
        description: `Há um acúmulo de ${highFindings} findings de alta severidade que podem representar riscos significativos.`,
        recommendation: 'Revise e priorize a remediação dos findings de alta severidade.',
        confidence: 0.88,
        generatedAt: now
      });
    }

    // 3. Check cost trends (compare last 7 days vs previous 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [recentCosts, previousCosts] = await Promise.all([
      prisma.dailyCost.aggregate({
        where: {
          ...baseFilter,
          date: { gte: sevenDaysAgo }
        },
        _sum: { cost: true }
      }),
      prisma.dailyCost.aggregate({
        where: {
          ...baseFilter,
          date: { gte: fourteenDaysAgo, lt: sevenDaysAgo }
        },
        _sum: { cost: true }
      })
    ]);

    const recentTotal = Number(recentCosts._sum?.cost || 0);
    const previousTotal = Number(previousCosts._sum?.cost || 0);

    if (previousTotal > 0 && recentTotal > previousTotal * 1.2) {
      const increase = ((recentTotal - previousTotal) / previousTotal * 100).toFixed(1);
      insights.push({
        id: `insight-cost-increase-${now.getTime()}`,
        type: 'cost_anomaly',
        severity: 'warning',
        title: `Aumento de ${increase}% nos custos`,
        description: `Os custos dos últimos 7 dias aumentaram ${increase}% em comparação com a semana anterior.`,
        recommendation: 'Analise os serviços com maior crescimento de custo e verifique se há recursos ociosos.',
        confidence: 0.85,
        generatedAt: now
      });
    }

    // 4. Check for cost optimization opportunities
    let savingsCount = 0;
    let totalSavings = 0;
    
    try {
      const costOptimizations = await prisma.costOptimization.aggregate({
        where: { 
          organization_id: organizationId,
          status: { in: ['pending', 'active'] }
        },
        _sum: { potential_savings: true },
        _count: true
      });
      savingsCount += costOptimizations._count || 0;
      totalSavings += Number(costOptimizations._sum?.potential_savings || 0);
    } catch { /* table might not exist */ }

    try {
      const riSpRecs = await prisma.riSpRecommendation.aggregate({
        where: { 
          organization_id: organizationId,
          status: { in: ['active', 'pending'] }
        },
        _sum: { estimated_monthly_savings: true },
        _count: true
      });
      savingsCount += riSpRecs._count || 0;
      totalSavings += Number(riSpRecs._sum?.estimated_monthly_savings || 0);
    } catch { /* table might not exist */ }

    if (totalSavings > 100) {
      insights.push({
        id: `insight-savings-${now.getTime()}`,
        type: 'optimization',
        severity: 'info',
        title: `${currencySymbol} ${totalSavings.toFixed(2)}/mês em economia potencial`,
        description: `Identificamos ${savingsCount} recomendações de otimização que podem economizar até ${currencySymbol} ${totalSavings.toFixed(2)} por mês.`,
        recommendation: 'Revise as recomendações de Reserved Instances e Savings Plans.',
        confidence: 0.92,
        generatedAt: now
      });
    }

    // 5. Check endpoint health
    try {
      const downEndpoints = await prisma.monitoredEndpoint.count({
        where: {
          organization_id: organizationId,
          is_active: true,
          last_status: 'down'
        }
      });

      if (downEndpoints > 0) {
        insights.push({
          id: `insight-endpoints-down-${now.getTime()}`,
          type: 'security_risk',
          severity: downEndpoints > 2 ? 'critical' : 'warning',
          title: `${downEndpoints} endpoint(s) fora do ar`,
          description: `Detectamos ${downEndpoints} endpoint(s) monitorado(s) que estão indisponíveis.`,
          recommendation: 'Verifique a saúde dos serviços e infraestrutura afetados.',
          confidence: 0.98,
          generatedAt: now
        });
      }
    } catch { /* table might not exist */ }

    // Sort by severity (critical first, then warning, then info)
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    insights.sort((a, b) => 
      (severityOrder[a.severity as keyof typeof severityOrder] || 3) - 
      (severityOrder[b.severity as keyof typeof severityOrder] || 3)
    );

    return insights.slice(0, 5); // Return top 5 insights

  } catch (err) {
    logger.error('Error generating insights', err as Error);
    return [];
  }
}

async function getTrendsData(
  prisma: any,
  organizationId: string,
  period: '7d' | '30d' | '90d',
  accountId?: string,
  provider?: string
): Promise<TrendData> {
  
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  // Determine which account field to use based on provider
  const isAzure = provider === 'AZURE';
  const accountField = isAzure ? 'azure_credential_id' : 'aws_account_id';

  // Cost by day - aggregate by date since we have per-service rows
  // Use raw query to avoid Prisma groupBy issues
  let costTrend: any[] = [];
  try {
    if (accountId) {
      if (isAzure) {
        costTrend = await prisma.$queryRaw`
          SELECT 
            date,
            SUM(cost) as total_cost
          FROM daily_costs
          WHERE organization_id = ${organizationId}::uuid
            AND azure_credential_id = ${accountId}::uuid
            AND date >= ${startDate}
          GROUP BY date
          ORDER BY date ASC
        `;
      } else {
        costTrend = await prisma.$queryRaw`
          SELECT 
            date,
            SUM(cost) as total_cost
          FROM daily_costs
          WHERE organization_id = ${organizationId}::uuid
            AND aws_account_id = ${accountId}::uuid
            AND date >= ${startDate}
          GROUP BY date
          ORDER BY date ASC
        `;
      }
    } else {
      costTrend = await prisma.$queryRaw`
        SELECT 
          date,
          SUM(cost) as total_cost
        FROM daily_costs
        WHERE organization_id = ${organizationId}::uuid
          AND date >= ${startDate}
        GROUP BY date
        ORDER BY date ASC
      `;
    }
  } catch (err) {
    // Fallback: try with findMany and aggregate in memory
    try {
      const baseFilter: any = {
        organization_id: organizationId,
        date: { gte: startDate }
      };
      if (accountId) {
        if (isAzure) {
          baseFilter.azure_credential_id = accountId;
        } else {
          baseFilter.aws_account_id = accountId;
        }
      }
      
      const rawCosts = await prisma.dailyCost.findMany({
        where: baseFilter,
        select: {
          date: true,
          cost: true
        },
        orderBy: { date: 'asc' }
      });
      
      // Aggregate by date in memory
      const costByDate = new Map<string, number>();
      rawCosts.forEach((c: any) => {
        const dateKey = c.date.toISOString().split('T')[0];
        costByDate.set(dateKey, (costByDate.get(dateKey) || 0) + Number(c.cost || 0));
      });
      
      costTrend = Array.from(costByDate.entries()).map(([date, total_cost]) => ({
        date: new Date(date),
        total_cost
      }));
    } catch {
      costTrend = [];
    }
  }

  // Security posture history - try from security_posture table first
  let securityTrend: any[] = [];
  try {
    const securityFilter: any = {
      organization_id: organizationId,
      calculated_at: { gte: startDate }
    };
    // Note: security_posture table may not have aws_account_id
    
    securityTrend = await prisma.securityPosture.findMany({
      where: securityFilter,
      orderBy: { calculated_at: 'asc' },
      select: {
        calculated_at: true,
        overall_score: true,
        critical_findings: true,
        high_findings: true
      }
    });
  } catch {
    securityTrend = [];
  }

  // If no security posture history, generate from findings data
  if (securityTrend.length === 0) {
    try {
      // Get findings grouped by date to calculate daily scores
      const findingsByDate = await prisma.$queryRaw`
        SELECT 
          DATE(created_at) as date,
          severity,
          COUNT(*) as count
        FROM findings
        WHERE organization_id = ${organizationId}::uuid
          AND created_at >= ${startDate}
        GROUP BY DATE(created_at), severity
        ORDER BY date ASC
      `;

      // Aggregate findings by date and calculate score
      const dateMap = new Map<string, { critical: number; high: number; medium: number; low: number }>();
      
      (findingsByDate as any[]).forEach((f: any) => {
        const dateKey = f.date instanceof Date 
          ? f.date.toISOString().split('T')[0]
          : String(f.date).split('T')[0];
        
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, { critical: 0, high: 0, medium: 0, low: 0 });
        }
        
        const severity = String(f.severity).toLowerCase();
        const counts = dateMap.get(dateKey)!;
        const count = Number(f.count || 0);
        
        if (severity === 'critical') counts.critical += count;
        else if (severity === 'high') counts.high += count;
        else if (severity === 'medium') counts.medium += count;
        else if (severity === 'low') counts.low += count;
      });

      // Convert to security trend format
      securityTrend = Array.from(dateMap.entries()).map(([date, counts]) => {
        const totalFindings = counts.critical + counts.high + counts.medium + counts.low;
        const weightedScore = (counts.critical * 10) + (counts.high * 5) + 
                              (counts.medium * 2) + (counts.low * 0.5);
        const maxPossibleScore = totalFindings * 10;
        const score = totalFindings > 0 
          ? Math.max(0, Math.round(100 - (weightedScore / maxPossibleScore * 100)))
          : 100;

        return {
          calculated_at: new Date(date),
          overall_score: score,
          critical_findings: counts.critical,
          high_findings: counts.high
        };
      });
    } catch {
      // If raw query fails, try simpler approach
      securityTrend = [];
    }
  }

  return {
    cost: costTrend.map((c: any) => ({
      date: (c.date instanceof Date ? c.date : new Date(c.date)).toISOString().split('T')[0],
      cost: Number(c.total_cost || c._sum?.cost || 0),
      credits: 0,
      net: Number(c.total_cost || c._sum?.cost || 0)
    })),
    security: securityTrend.map((s: any) => ({
      date: s.calculated_at.toISOString().split('T')[0],
      score: s.overall_score || 0,
      findings: (s.critical_findings || 0) + (s.high_findings || 0)
    })),
    period
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateExecutiveSummary(
  financial: FinancialHealth,
  security: SecurityPosture,
  operations: OperationsCenter
): ExecutiveSummary {
  
  // Financial score (0-100)
  const financialScore = Math.max(0, 100 - (financial.budgetUtilization - 80));
  
  // Operational score (0-100) - treat "no endpoints" as neutral (not penalizing)
  const hasEndpoints = operations.endpoints.total > 0;
  const operationalScore = hasEndpoints ? operations.uptime.current : -1;
  
  // Security score - handle "no data" case (score = -1)
  const securityScore = security.score === -1 ? -1 : security.score;
  
  // Overall weighted score - adjust weights based on available data
  const hasSecurityData = security.score !== -1;
  const hasOperationalData = hasEndpoints;
  
  let overallScore: number;
  if (!hasSecurityData && !hasOperationalData) {
    // Only financial data available
    overallScore = Math.round(Math.min(100, financialScore));
  } else if (!hasSecurityData) {
    // Financial + operational
    overallScore = Math.round(
      (Math.min(100, financialScore) * 0.5) +
      (operationalScore * 0.5)
    );
  } else if (!hasOperationalData) {
    // Financial + security
    overallScore = Math.round(
      (securityScore * 0.5) +
      (Math.min(100, financialScore) * 0.5)
    );
  } else {
    // All data available
    overallScore = Math.round(
      (securityScore * 0.4) + 
      (Math.min(100, financialScore) * 0.3) +
      (operationalScore * 0.3)
    );
  }

  return {
    overallScore,
    scoreChange: 0, // TODO: calculate vs previous week
    mtdSpend: financial.mtdCost,
    budget: financial.budget,
    budgetUtilization: financial.budgetUtilization,
    budgetSource: financial.budgetSource,
    potentialSavings: financial.savings.potential,
    uptimeSLA: operations.uptime.current,
    activeAlerts: {
      critical: security.findings.critical + operations.alerts.count.critical,
      high: security.findings.high + operations.alerts.count.high,
      medium: security.findings.medium
    }
  };
}

function mapPriorityToSeverity(priority: number): 'info' | 'warning' | 'critical' {
  if (priority >= 8) return 'critical';
  if (priority >= 5) return 'warning';
  return 'info';
}
