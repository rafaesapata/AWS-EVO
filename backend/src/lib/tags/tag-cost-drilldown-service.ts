/**
 * Tag Cost Drill-Down Service — Deep cost analysis by tag
 */

import { getPrismaClient } from '../database.js';
import { logger } from '../logger.js';

export interface CostDrilldownParams {
  tagId: string;
  startDate?: string;
  endDate?: string;
  groupBy?: 'service' | 'resource' | 'day';
}

export async function getTagCostDrilldown(organizationId: string, params: CostDrilldownParams) {
  const prisma = getPrismaClient();
  const { tagId, groupBy = 'service' } = params;

  // Get all resource_ids assigned to this tag
  const assignments = await prisma.resourceTagAssignment.findMany({
    where: { organization_id: organizationId, tag_id: tagId },
    select: { resource_id: true, resource_type: true, resource_name: true, cloud_provider: true },
  });

  if (assignments.length === 0) {
    return { totalCost: 0, items: [], timeSeries: [], resourceCount: 0 };
  }

  // Extract service names from resource_ids (format: "service::accountId")
  const serviceNames = [...new Set(assignments.map((a: any) => a.resource_id.split('::')[0]))];

  // Date range
  const now = new Date();
  const start = params.startDate || new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
  const end = params.endDate || now.toISOString().slice(0, 10);

  if (groupBy === 'service') {
    const costs: any[] = await prisma.$queryRaw`
      SELECT 
        service,
        COALESCE(cloud_provider, 'AWS') as cloud_provider,
        SUM(cost) as total_cost,
        COUNT(DISTINCT date) as days_active,
        MIN(date) as first_seen,
        MAX(date) as last_seen
      FROM daily_costs
      WHERE organization_id = ${organizationId}::uuid
        AND service = ANY(${serviceNames})
        AND date >= ${start}::date
        AND date <= ${end}::date
      GROUP BY service, cloud_provider
      ORDER BY SUM(cost) DESC
    `;

    const totalCost = costs.reduce((sum: number, c: any) => sum + Number(c.total_cost || 0), 0);

    return {
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
  }

  if (groupBy === 'day') {
    const timeSeries: any[] = await prisma.$queryRaw`
      SELECT 
        date,
        SUM(cost) as daily_cost
      FROM daily_costs
      WHERE organization_id = ${organizationId}::uuid
        AND service = ANY(${serviceNames})
        AND date >= ${start}::date
        AND date <= ${end}::date
      GROUP BY date
      ORDER BY date ASC
    `;

    const totalCost = timeSeries.reduce((sum: number, d: any) => sum + Number(d.daily_cost || 0), 0);

    return {
      totalCost,
      items: [],
      timeSeries: timeSeries.map((d: any) => ({
        date: d.date,
        cost: Number(d.daily_cost),
      })),
      resourceCount: assignments.length,
    };
  }

  // groupBy === 'resource' — individual resources
  const costs: any[] = await prisma.$queryRaw`
    SELECT 
      service,
      COALESCE(aws_account_id::text, COALESCE(azure_credential_id::text, 'unknown')) as account_id,
      COALESCE(cloud_provider, 'AWS') as cloud_provider,
      SUM(cost) as total_cost,
      COUNT(DISTINCT date) as days_active
    FROM daily_costs
    WHERE organization_id = ${organizationId}::uuid
      AND service = ANY(${serviceNames})
      AND date >= ${start}::date
      AND date <= ${end}::date
    GROUP BY service, aws_account_id, azure_credential_id, cloud_provider
    ORDER BY SUM(cost) DESC
    LIMIT 100
  `;

  const totalCost = costs.reduce((sum: number, c: any) => sum + Number(c.total_cost || 0), 0);

  return {
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
