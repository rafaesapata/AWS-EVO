/**
 * Tag Report Service — Smart Resource Tagging
 * Business logic for cost, security, and inventory reports
 */

import { getPrismaClient } from '../database.js';
import { logger } from '../logger.js';
import { getCachedCostReport, setCachedCostReport } from './tag-cache.js';

// ============================================================================
// COST REPORT
// ============================================================================

export async function getCostReport(
  organizationId: string,
  tagId: string,
  params: {
    startDate: string;
    endDate: string;
    cloudProvider?: string;
    accountId?: string;
  }
) {
  const dateRange = `${params.startDate}_${params.endDate}`;
  const cached = await getCachedCostReport(organizationId, tagId, dateRange);
  if (cached) return { data: cached };

  const prisma = getPrismaClient();

  // Get resource types associated with this tag
  const assignments = await prisma.resourceTagAssignment.findMany({
    where: { tag_id: tagId, organization_id: organizationId },
    select: { resource_type: true, cloud_provider: true },
    distinct: ['resource_type'],
  });

  if (assignments.length === 0) {
    const empty = {
      totalCost: 0, costByService: {}, costByProvider: {},
      timeSeries: [], resourceCount: 0,
      disclaimer: 'Costs are service-aggregated, not per-resource',
    };
    return { data: empty };
  }

  // Extract service names from resource types (e.g., aws:ec2:instance → ec2)
  const serviceNames = assignments.map((a: any) => {
    const parts = a.resource_type.split(':');
    return parts.length >= 2 ? parts[1] : a.resource_type;
  });

  // Query DailyCost
  const costWhere: any = {
    organization_id: organizationId,
    date: { gte: new Date(params.startDate), lte: new Date(params.endDate) },
  };
  if (params.cloudProvider) costWhere.cloud_provider = params.cloudProvider;
  if (params.accountId) costWhere.aws_account_id = params.accountId;

  let costs: any[] = [];
  try {
    costs = await prisma.dailyCost.findMany({ where: costWhere });
  } catch {
    logger.warn('DailyCost table may not exist');
  }

  // Filter costs by service names (service-level aggregation)
  const filteredCosts = costs.filter((c: any) => {
    const serviceLower = (c.service || '').toLowerCase();
    return serviceNames.some((s: string) => serviceLower.includes(s));
  });

  const totalCost = filteredCosts.reduce((sum: number, c: any) => sum + (parseFloat(c.cost) || 0), 0);

  const costByService: Record<string, number> = {};
  const costByProvider: Record<string, number> = {};
  const timeSeriesMap: Record<string, number> = {};

  for (const c of filteredCosts) {
    const service = c.service || 'unknown';
    const provider = c.cloud_provider || 'unknown';
    const date = c.date instanceof Date ? c.date.toISOString().split('T')[0] : String(c.date);
    const amount = parseFloat(c.cost) || 0;

    costByService[service] = (costByService[service] || 0) + amount;
    costByProvider[provider] = (costByProvider[provider] || 0) + amount;
    timeSeriesMap[date] = (timeSeriesMap[date] || 0) + amount;
  }

  const timeSeries = Object.entries(timeSeriesMap)
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const resourceCount = await prisma.resourceTagAssignment.count({
    where: { tag_id: tagId, organization_id: organizationId },
  });

  const report = {
    totalCost: Math.round(totalCost * 100) / 100,
    costByService, costByProvider, timeSeries, resourceCount,
    disclaimer: 'Costs are service-aggregated, not per-resource',
  };

  await setCachedCostReport(organizationId, tagId, dateRange, report);
  return { data: report };
}

// ============================================================================
// SECURITY FINDINGS
// ============================================================================

export async function getSecurityFindings(
  organizationId: string,
  tagIds: string[],
  params: {
    limit?: number;
    cursor?: string;
    severity?: string;
    status?: string;
    cloudProvider?: string;
  }
) {
  const prisma = getPrismaClient();
  const limit = Math.min(Math.max(params.limit || 50, 1), 100);

  // Get resource_ids that have ALL specified tags (AND logic)
  const resourceGroups = await prisma.resourceTagAssignment.groupBy({
    by: ['resource_id'],
    where: {
      organization_id: organizationId,
      tag_id: { in: tagIds },
    },
    having: {
      resource_id: { _count: { equals: tagIds.length } },
    },
  });

  const matchingResourceIds = resourceGroups.map((r: any) => r.resource_id);

  if (matchingResourceIds.length === 0) {
    return { data: [], nextCursor: null };
  }

  // Query findings
  const findingWhere: any = {
    organization_id: organizationId,
    resource_id: { in: matchingResourceIds },
  };
  if (params.severity) findingWhere.severity = params.severity;
  if (params.status) findingWhere.status = params.status;
  if (params.cloudProvider) findingWhere.cloud_provider = params.cloudProvider;

  const cursorObj = params.cursor ? { id: params.cursor } : undefined;

  let findings: any[] = [];
  try {
    findings = await prisma.finding.findMany({
      where: findingWhere,
      take: limit + 1,
      orderBy: { created_at: 'desc' },
      ...(cursorObj ? { cursor: cursorObj, skip: 1 } : {}),
    });
  } catch {
    logger.warn('Finding table query error');
    return { data: [], nextCursor: null };
  }

  const hasMore = findings.length > limit;
  const data = hasMore ? findings.slice(0, limit) : findings;

  // Enrich with tags
  const enriched = await Promise.all(
    data.map(async (f: any) => {
      const tags = await prisma.resourceTagAssignment.findMany({
        where: { organization_id: organizationId, resource_id: f.resource_id },
        include: { tag: true },
      });
      return { ...f, tags: tags.map((t: any) => t.tag) };
    })
  );

  return {
    data: enriched,
    nextCursor: hasMore ? data[data.length - 1].id : null,
  };
}

// ============================================================================
// INVENTORY REPORT
// ============================================================================

export async function getInventoryReport(
  organizationId: string,
  tagId: string,
  params: { resourceType?: string; cloudProvider?: string }
) {
  const prisma = getPrismaClient();

  const where: any = { tag_id: tagId, organization_id: organizationId };
  if (params.resourceType) where.resource_type = params.resourceType;
  if (params.cloudProvider) where.cloud_provider = params.cloudProvider;

  const groups = await prisma.resourceTagAssignment.groupBy({
    by: ['resource_type', 'cloud_provider'],
    where,
    _count: true,
  });

  const totalResources = groups.reduce((sum: number, g: any) => sum + g._count, 0);

  const byResourceType = groups.reduce((acc: any[], g: any) => {
    const existing = acc.find((x: any) => x.resource_type === g.resource_type);
    if (existing) existing.count += g._count;
    else acc.push({ resource_type: g.resource_type, count: g._count });
    return acc;
  }, []).sort((a: any, b: any) => b.count - a.count);

  const byProvider = groups.reduce((acc: any, g: any) => {
    acc[g.cloud_provider] = (acc[g.cloud_provider] || 0) + g._count;
    return acc;
  }, {} as Record<string, number>);

  return {
    data: { totalResources, byResourceType, byProvider },
  };
}
