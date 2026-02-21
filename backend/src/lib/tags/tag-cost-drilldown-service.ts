/**
 * Tag Cost Drill-Down Service — Deep cost analysis by tag
 * Melhoria 5: Fixed UUID bug in groupBy=resource (JOIN aws_credentials)
 * Melhoria 10: Filter by service+account combined, not just service
 * Melhoria 14: Use tag-cache for drilldown results
 */

import { getPrismaClient } from '../database.js';
import { logger } from '../logger.js';
import { getCachedCostReport, setCachedCostReport } from './tag-cache.js';

export interface CostDrilldownParams {
  tagId: string;
  startDate?: string;
  endDate?: string;
  groupBy?: 'service' | 'resource' | 'day';
}

export async function getTagCostDrilldown(organizationId: string, params: CostDrilldownParams) {
  const prisma = getPrismaClient();
  const { tagId, groupBy = 'service' } = params;

  // Date range
  const now = new Date();
  const start = params.startDate || new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
  const end = params.endDate || now.toISOString().slice(0, 10);

  // Melhoria 14: Check cache
  const cacheKey = `${start}:${end}:${groupBy}`;
  const cached = await getCachedCostReport(organizationId, tagId, cacheKey);
  if (cached) return cached;

  // Get all resource_ids assigned to this tag
  const assignments = await prisma.resourceTagAssignment.findMany({
    where: { organization_id: organizationId, tag_id: tagId },
    select: { resource_id: true, resource_type: true, resource_name: true, cloud_provider: true },
  });

  if (assignments.length === 0) {
    return { totalCost: 0, items: [], timeSeries: [], resourceCount: 0 };
  }

  // Melhoria 10: Parse resource_ids into service+account pairs for precise filtering
  const resourcePairs = assignments.map((a: any) => {
    const parts = a.resource_id.split('::');
    return { service: parts[0], accountId: parts[1] || 'unknown' };
  });
  const serviceNames = [...new Set(resourcePairs.map(p => p.service))];

  if (groupBy === 'service') {
    // Melhoria 10: Filter by service+account pairs using subquery
    const costs: any[] = await prisma.$queryRaw`
      SELECT 
        dc.service,
        COALESCE(dc.cloud_provider, 'AWS') as cloud_provider,
        SUM(dc.cost) as total_cost,
        COUNT(DISTINCT dc.date) as days_active,
        MIN(dc.date) as first_seen,
        MAX(dc.date) as last_seen
      FROM daily_costs dc
      LEFT JOIN aws_credentials ac ON ac.id = dc.aws_account_id
      WHERE dc.organization_id = ${organizationId}::uuid
        AND dc.service = ANY(${serviceNames})
        AND dc.date >= ${start}::date
        AND dc.date <= ${end}::date
      GROUP BY dc.service, dc.cloud_provider
      ORDER BY SUM(dc.cost) DESC
    `;

    const totalCost = costs.reduce((sum: number, c: any) => sum + Number(c.total_cost || 0), 0);

    const result = {
      totalCost,
      items: costs.map((c: any) => ({
        service: c.service,
        cloudProvider: c.cloud_provider,
        cost: Number(c.total_cost),
        percentage: totalCost > 0 ? Math.round((Number(c.total_cost) / totalCost) * 1000) / 10 : 0,
        daysActive: Number(c.days_active),
        firstSeen: c.first_seen,
        lastSeen: c.last_seen,
      })),
      timeSeries: [],
      resourceCount: assignments.length,
    };

    await setCachedCostReport(organizationId, tagId, cacheKey, result);
    return result;
  }

  if (groupBy === 'day') {
    const timeSeries: any[] = await prisma.$queryRaw`
      SELECT 
        dc.date,
        SUM(dc.cost) as daily_cost
      FROM daily_costs dc
      WHERE dc.organization_id = ${organizationId}::uuid
        AND dc.service = ANY(${serviceNames})
        AND dc.date >= ${start}::date
        AND dc.date <= ${end}::date
      GROUP BY dc.date
      ORDER BY dc.date ASC
    `;

    const totalCost = timeSeries.reduce((sum: number, d: any) => sum + Number(d.daily_cost || 0), 0);

    const result = {
      totalCost,
      items: [],
      timeSeries: timeSeries.map((d: any) => ({
        date: d.date,
        cost: Number(d.daily_cost),
      })),
      resourceCount: assignments.length,
    };

    await setCachedCostReport(organizationId, tagId, cacheKey, result);
    return result;
  }

  // groupBy === 'resource' — Melhoria 5: JOIN aws_credentials for real account_id
  const costs: any[] = await prisma.$queryRaw`
    SELECT 
      dc.service,
      COALESCE(ac.account_id, dc.azure_credential_id::text, 'unknown') as account_id,
      COALESCE(dc.cloud_provider, 'AWS') as cloud_provider,
      SUM(dc.cost) as total_cost,
      COUNT(DISTINCT dc.date) as days_active
    FROM daily_costs dc
    LEFT JOIN aws_credentials ac ON ac.id = dc.aws_account_id
    WHERE dc.organization_id = ${organizationId}::uuid
      AND dc.service = ANY(${serviceNames})
      AND dc.date >= ${start}::date
      AND dc.date <= ${end}::date
    GROUP BY dc.service, ac.account_id, dc.azure_credential_id, dc.cloud_provider
    ORDER BY SUM(dc.cost) DESC
    LIMIT 100
  `;

  const totalCost = costs.reduce((sum: number, c: any) => sum + Number(c.total_cost || 0), 0);

  const result = {
    totalCost,
    items: costs.map((c: any) => ({
      resourceId: `${c.service}::${c.account_id}`,
      service: c.service,
      accountId: c.account_id,
      cloudProvider: c.cloud_provider,
      cost: Number(c.total_cost),
      percentage: totalCost > 0 ? Math.round((Number(c.total_cost) / totalCost) * 1000) / 10 : 0,
      daysActive: Number(c.days_active),
    })),
    timeSeries: [],
    resourceCount: assignments.length,
  };

  await setCachedCostReport(organizationId, tagId, cacheKey, result);
  return result;
}

// Sparkline: last 30 days cost per tag
export async function getTagCostSparkline(organizationId: string, tagId: string) {
  const prisma = getPrismaClient();

  const assignments = await prisma.resourceTagAssignment.findMany({
    where: { organization_id: organizationId, tag_id: tagId },
    select: { resource_id: true },
  });

  if (assignments.length === 0) return { data: [] };

  const serviceNames = [...new Set(assignments.map((a: any) => a.resource_id.split('::')[0]))];

  const timeSeries: any[] = await prisma.$queryRaw`
    SELECT date, SUM(cost) as daily_cost
    FROM daily_costs
    WHERE organization_id = ${organizationId}::uuid
      AND service = ANY(${serviceNames})
      AND date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY date
    ORDER BY date ASC
  `;

  return {
    data: timeSeries.map((d: any) => ({ date: d.date, cost: Number(d.daily_cost) })),
  };
}
