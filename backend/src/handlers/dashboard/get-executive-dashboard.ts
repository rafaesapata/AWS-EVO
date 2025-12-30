/**
 * Executive Dashboard - Consolidated API Handler
 * Single endpoint that returns all dashboard data aggregated
 * Reduces frontend queries from 8 to 1
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, badRequest } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getOrigin } from '../../lib/middleware.js';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

interface ExecutiveSummary {
  overallScore: number;
  scoreChange: number;
  mtdSpend: number;
  budget: number;
  budgetUtilization: number;
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
    const organizationId = getOrganizationId(user);
    const userId = user.sub;

    // 2. Validate input
    const body = event.body ? JSON.parse(event.body) : {};
    const params = requestSchema.parse(body);

    logger.info('Executive Dashboard request', {
      organizationId,
      userId,
      params,
      requestId: context.awsRequestId
    });

    const prisma = getPrismaClient();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // 3. Execute queries in parallel for performance
    const [
      financialData,
      securityData,
      operationsData,
      insightsData,
      trendsData
    ] = await Promise.all([
      getFinancialData(prisma, organizationId, params.accountId || undefined, startOfMonth, startOfYear),
      getSecurityData(prisma, organizationId),
      getOperationsData(prisma, organizationId),
      params.includeInsights ? getInsightsData(prisma, organizationId) : Promise.resolve([]),
      params.includeTrends ? getTrendsData(prisma, organizationId, params.trendPeriod) : Promise.resolve(null)
    ]);

    // 4. Calculate aggregated scores
    const summary = calculateExecutiveSummary(financialData, securityData, operationsData);

    // 5. Build response
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
        accountId: params.accountId || 'all',
        trendPeriod: params.trendPeriod
      }
    };

    const executionTime = Date.now() - startTime;
    logger.info('Executive Dashboard generated', {
      organizationId,
      overallScore: summary.overallScore,
      executionTime,
      requestId: context.awsRequestId
    });

    return success(response, 200, origin);

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
  _accountId: string | undefined, // Not used - daily_costs doesn't filter by account
  startOfMonth: Date,
  startOfYear: Date
): Promise<FinancialHealth> {
  
  // Base filter - only by organization_id (account_id filter not supported in daily_costs)
  const baseFilter: any = { organization_id: organizationId };

  // MTD costs aggregation - using correct column names (date, cost)
  const mtdCosts = await prisma.dailyCost.aggregate({
    where: {
      ...baseFilter,
      date: { gte: startOfMonth }
    },
    _sum: {
      cost: true
    },
    _max: {
      date: true
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

  // Cost recommendations - try different table names
  let recommendations = { _sum: { projected_savings_monthly: 0 }, _count: 0 };
  try {
    recommendations = await prisma.costRecommendation.aggregate({
      where: { organization_id: organizationId },
      _sum: { projected_savings_monthly: true },
      _count: true
    });
  } catch {
    // Table might not exist
  }

  // RI/SP recommendations
  let riSpRecommendations = { _sum: { monthly_savings: 0 }, _count: 0 };
  try {
    riSpRecommendations = await prisma.riSpRecommendation.aggregate({
      where: { organization_id: organizationId },
      _sum: { monthly_savings: true },
      _count: true
    });
  } catch {
    // Table might not exist
  }

  const mtdTotal = Number(mtdCosts._sum.cost || 0);
  const budgetAmount = mtdTotal > 0 ? mtdTotal * 1.2 : 10000; // Default budget

  const sortedServices = topServices.map((item: any, index: number) => ({
    service: item.service || 'Unknown',
    cost: Number(item._sum.cost || 0),
    percentage: mtdTotal > 0 ? (Number(item._sum.cost || 0) / mtdTotal) * 100 : 0,
    rank: index + 1
  }));

  return {
    mtdCost: mtdTotal,
    ytdCost: Number(ytdCosts._sum.cost || 0),
    credits: 0, // No credits column in current schema
    netCost: mtdTotal,
    budget: budgetAmount,
    budgetUtilization: budgetAmount > 0 ? (mtdTotal / budgetAmount) * 100 : 0,
    topServices: sortedServices,
    savings: {
      potential: Number(recommendations._sum?.projected_savings_monthly || 0) +
                 Number(riSpRecommendations._sum?.monthly_savings || 0),
      costRecommendations: Number(recommendations._sum?.projected_savings_monthly || 0),
      riSpRecommendations: Number(riSpRecommendations._sum?.monthly_savings || 0),
      recommendationsCount: (recommendations._count || 0) + (riSpRecommendations._count || 0)
    },
    lastCostUpdate: mtdCosts._max.date?.toISOString() || null
  };
}

async function getSecurityData(
  prisma: any,
  organizationId: string
): Promise<SecurityPosture> {
  
  // Count by severity (optimized with groupBy)
  const findingsBySeverity = await prisma.finding.groupBy({
    by: ['severity'],
    where: {
      organization_id: organizationId,
      status: { in: ['pending', 'active', 'ACTIVE', 'PENDING'] }
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
  const weightedScore = (counts.critical * 10) + (counts.high * 5) +
                        (counts.medium * 2) + (counts.low * 0.5);
  const maxPossibleScore = totalFindings > 0 ? totalFindings * 10 : 1;
  const securityScore = Math.max(0, Math.round(100 - (weightedScore / maxPossibleScore * 100)));

  // Findings resolved vs new (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const [newFindings, resolvedFindings] = await Promise.all([
    prisma.finding.count({
      where: {
        organization_id: organizationId,
        created_at: { gte: sevenDaysAgo }
      }
    }),
    prisma.finding.count({
      where: {
        organization_id: organizationId,
        status: { in: ['resolved', 'RESOLVED'] },
        updated_at: { gte: sevenDaysAgo }
      }
    })
  ]);

  // Last scan
  const lastScan = await prisma.securityScan.findFirst({
    where: { organization_id: organizationId },
    orderBy: { started_at: 'desc' },
    select: { completed_at: true }
  });

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
    lastScanDate: lastScan?.completed_at?.toISOString() || null
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

  // Calculate uptime
  const uptime = endpointStats.total > 0 
    ? ((endpointStats.healthy + endpointStats.degraded * 0.5) / endpointStats.total) * 100
    : 100;

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

  // Remediation stats - use SecurityAlert as proxy
  let remediationStats: any[] = [];
  try {
    remediationStats = await prisma.securityAlert.groupBy({
      by: ['is_resolved'],
      where: { organization_id: organizationId },
      _count: true
    });
  } catch {
    remediationStats = [];
  }

  const remediations = {
    pending: 0,
    inProgress: 0,
    resolved: 0,
    total: 0
  };

  remediationStats.forEach((r: any) => {
    if (r.is_resolved) {
      remediations.resolved = r._count;
    } else {
      remediations.pending = r._count;
    }
    remediations.total += r._count;
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
  organizationId: string
): Promise<AIInsight[]> {
  // AI Insights table doesn't exist yet - return empty array
  // Future: implement AI insights generation
  return [];
}

async function getTrendsData(
  prisma: any,
  organizationId: string,
  period: '7d' | '30d' | '90d'
): Promise<TrendData> {
  
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Cost by day - aggregate by date since we have per-service rows
  // Use raw query to avoid Prisma groupBy issues
  let costTrend: any[] = [];
  try {
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
  } catch (err) {
    // Fallback: try with findMany and aggregate in memory
    const rawCosts = await prisma.dailyCost.findMany({
      where: {
        organization_id: organizationId,
        date: { gte: startDate }
      },
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
  }

  // Security posture history
  let securityTrend: any[] = [];
  try {
    securityTrend = await prisma.securityPosture.findMany({
      where: {
        organization_id: organizationId,
        calculated_at: { gte: startDate }
      },
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
  
  // Operational score (0-100)
  const operationalScore = operations.uptime.current;
  
  // Overall weighted score
  const overallScore = Math.round(
    (security.score * 0.4) + 
    (Math.min(100, financialScore) * 0.3) +
    (operationalScore * 0.3)
  );

  return {
    overallScore,
    scoreChange: 0, // TODO: calculate vs previous week
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

function mapPriorityToSeverity(priority: number): 'info' | 'warning' | 'critical' {
  if (priority >= 8) return 'critical';
  if (priority >= 5) return 'warning';
  return 'info';
}
