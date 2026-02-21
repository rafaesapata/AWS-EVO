/**
 * Tag Assignment Service — Smart Resource Tagging
 * Business logic for assign/unassign/bulk operations
 */

import { getPrismaClient } from '../database.js';
import { logger } from '../logger.js';
import { MAX_TAGS_PER_RESOURCE, MAX_BULK_RESOURCES, BULK_BATCH_SIZE } from './tag-validation.js';
import { invalidateOnAssignmentChange } from './tag-cache.js';

// ============================================================================
// TYPES
// ============================================================================

interface ResourceInput {
  resourceId: string;
  resourceType: string;
  cloudProvider: string;
  resourceName?: string;
  resourceRegion?: string;
  awsAccountId?: string;
  azureCredentialId?: string;
}

interface PartialSuccessResponse {
  totalProcessed: number;
  assignedCount: number;
  skippedCount: number;
  failedCount: number;
  failures: Array<{ resourceId: string; error: string; code: string }>;
}

interface UnassignResponse {
  removedCount: number;
  notFoundCount: number;
}

// ============================================================================
// ASSIGN TAG
// ============================================================================

export async function assignTag(
  organizationId: string,
  userId: string,
  tagId: string,
  resources: ResourceInput[]
): Promise<PartialSuccessResponse> {
  const prisma = getPrismaClient();
  const result: PartialSuccessResponse = {
    totalProcessed: resources.length,
    assignedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    failures: [],
  };

  // Verify tag exists and belongs to org
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, organization_id: organizationId },
  });
  if (!tag) {
    return { ...result, failedCount: resources.length, failures: resources.map(r => ({ resourceId: r.resourceId, error: 'Tag not found', code: 'TAG_NOT_FOUND' })) };
  }

  for (const resource of resources) {
    try {
      // Check if already assigned
      const existing = await prisma.resourceTagAssignment.findUnique({
        where: {
          uq_assignment_org_tag_resource: {
            organization_id: organizationId,
            tag_id: tagId,
            resource_id: resource.resourceId,
          },
        },
      });

      if (existing) {
        result.skippedCount++;
        continue;
      }

      // Check per-resource tag limit
      const resourceTagCount = await prisma.resourceTagAssignment.count({
        where: { organization_id: organizationId, resource_id: resource.resourceId },
      });

      if (resourceTagCount >= MAX_TAGS_PER_RESOURCE) {
        result.failedCount++;
        result.failures.push({
          resourceId: resource.resourceId,
          error: `Resource already has ${MAX_TAGS_PER_RESOURCE} tags`,
          code: 'RESOURCE_TAG_LIMIT_EXCEEDED',
        });
        continue;
      }

      await prisma.resourceTagAssignment.create({
        data: {
          organization_id: organizationId,
          tag_id: tagId,
          resource_id: resource.resourceId,
          resource_type: resource.resourceType,
          cloud_provider: resource.cloudProvider,
          resource_name: resource.resourceName || null,
          resource_region: resource.resourceRegion || null,
          aws_account_id: resource.awsAccountId || null,
          azure_credential_id: resource.azureCredentialId || null,
          assigned_by: userId,
        },
      });

      result.assignedCount++;
    } catch (err: any) {
      result.failedCount++;
      result.failures.push({
        resourceId: resource.resourceId,
        error: err.message || 'Unknown error',
        code: 'DB_ERROR',
      });
    }
  }

  await invalidateOnAssignmentChange(organizationId, tagId);
  return result;
}

// ============================================================================
// UNASSIGN TAG
// ============================================================================

export async function unassignTag(
  organizationId: string,
  tagId: string,
  resourceIds: string[]
): Promise<UnassignResponse> {
  const prisma = getPrismaClient();
  let removedCount = 0;
  let notFoundCount = 0;

  for (const resourceId of resourceIds) {
    const deleted = await prisma.resourceTagAssignment.deleteMany({
      where: {
        organization_id: organizationId,
        tag_id: tagId,
        resource_id: resourceId,
      },
    });

    if (deleted.count > 0) removedCount++;
    else notFoundCount++;
  }

  await invalidateOnAssignmentChange(organizationId, tagId);
  return { removedCount, notFoundCount };
}

// ============================================================================
// BULK ASSIGN
// ============================================================================

export interface BulkResourceInput {
  resourceId: string;
  resourceType?: string;
  resourceName?: string;
  cloudProvider?: string;
  awsAccountId?: string;
  azureCredentialId?: string;
}

export async function bulkAssign(
  organizationId: string,
  userId: string,
  tagIds: string[],
  resources: (string | BulkResourceInput)[]
): Promise<PartialSuccessResponse> {
  const normalizedResources: BulkResourceInput[] = resources.map((r) =>
    typeof r === 'string' ? { resourceId: r } : r
  );

  if (normalizedResources.length > MAX_BULK_RESOURCES) {
    return {
      totalProcessed: 0, assignedCount: 0, skippedCount: 0, failedCount: 0,
      failures: [{ resourceId: '', error: `Maximum ${MAX_BULK_RESOURCES} resources per bulk operation`, code: 'BULK_LIMIT_EXCEEDED' }],
    };
  }

  const prisma = getPrismaClient();
  const result: PartialSuccessResponse = {
    totalProcessed: 0, assignedCount: 0, skippedCount: 0, failedCount: 0, failures: [],
  };

  // Verify all tags exist (1 query)
  const tags = await prisma.tag.findMany({
    where: { id: { in: tagIds }, organization_id: organizationId },
  });
  const validTagIds = tags.map((t: any) => t.id);
  if (validTagIds.length === 0) return result;

  const resourceIds = normalizedResources.map(r => r.resourceId);
  result.totalProcessed = normalizedResources.length * validTagIds.length;

  // Batch query: get ALL existing assignments in one query
  const existingAssignments = await prisma.resourceTagAssignment.findMany({
    where: {
      organization_id: organizationId,
      tag_id: { in: validTagIds },
      resource_id: { in: resourceIds },
    },
    select: { tag_id: true, resource_id: true },
  });
  const existingSet = new Set(existingAssignments.map((a: any) => `${a.tag_id}::${a.resource_id}`));

  // Batch query: get per-resource tag counts in one query
  const resourceCounts = await prisma.resourceTagAssignment.groupBy({
    by: ['resource_id'],
    where: { organization_id: organizationId, resource_id: { in: resourceIds } },
    _count: true,
  });
  const countMap = new Map(resourceCounts.map((r: any) => [r.resource_id, r._count]));

  // Build createMany data, skipping existing and over-limit
  const resourceMap = new Map(normalizedResources.map(r => [r.resourceId, r]));
  const createData: any[] = [];

  for (const tagId of validTagIds) {
    for (const resource of normalizedResources) {
      const key = `${tagId}::${resource.resourceId}`;
      if (existingSet.has(key)) {
        result.skippedCount++;
        continue;
      }
      const currentCount = countMap.get(resource.resourceId) || 0;
      if (currentCount >= MAX_TAGS_PER_RESOURCE) {
        result.failedCount++;
        result.failures.push({
          resourceId: resource.resourceId,
          error: `Resource tag limit exceeded (${MAX_TAGS_PER_RESOURCE})`,
          code: 'RESOURCE_TAG_LIMIT_EXCEEDED',
        });
        continue;
      }
      createData.push({
        organization_id: organizationId,
        tag_id: tagId,
        resource_id: resource.resourceId,
        resource_type: resource.resourceType || 'unknown',
        resource_name: resource.resourceName || null,
        cloud_provider: resource.cloudProvider || 'aws',
        aws_account_id: resource.awsAccountId || null,
        azure_credential_id: resource.azureCredentialId || null,
        assigned_by: userId,
      });
      // Track count increase for subsequent iterations
      countMap.set(resource.resourceId, currentCount + 1);
    }
  }

  // Batch insert with skipDuplicates (1 query per batch of 500)
  if (createData.length > 0) {
    for (let i = 0; i < createData.length; i += 500) {
      const batch = createData.slice(i, i + 500);
      try {
        const created = await prisma.resourceTagAssignment.createMany({
          data: batch,
          skipDuplicates: true,
        });
        result.assignedCount += created.count;
      } catch (err: any) {
        logger.error('Bulk assign batch insert error', { error: err.message, batchSize: batch.length });
        result.failedCount += batch.length;
        result.failures.push({ resourceId: '', error: err.message, code: 'BATCH_INSERT_ERROR' });
      }
    }
    // Adjust: some may have been skipped by skipDuplicates
    const expectedAssigned = createData.length;
    const actualSkippedByDb = expectedAssigned - result.assignedCount - result.failures.filter(f => f.code === 'BATCH_INSERT_ERROR').length;
    if (actualSkippedByDb > 0) result.skippedCount += actualSkippedByDb;
  }

  // Invalidate cache for all affected tags
  for (const tagId of validTagIds) {
    await invalidateOnAssignmentChange(organizationId, tagId);
  }

  return result;
}

// ============================================================================
// GET TAGS FOR RESOURCE
// ============================================================================

export async function getTagsForResource(organizationId: string, resourceId: string) {
  const prisma = getPrismaClient();

  const assignments = await prisma.resourceTagAssignment.findMany({
    where: { organization_id: organizationId, resource_id: resourceId },
    include: { tag: true },
  });

  return assignments.map((a: any) => a.tag);
}

// ============================================================================
// GET RESOURCES BY TAG
// ============================================================================

export async function getResourcesByTag(
  organizationId: string,
  tagId: string,
  params: { limit?: number; cursor?: string; resourceType?: string; cloudProvider?: string }
) {
  const prisma = getPrismaClient();
  const limit = Math.min(Math.max(params.limit || 50, 1), 100);

  const where: any = { organization_id: organizationId, tag_id: tagId };
  if (params.resourceType) where.resource_type = params.resourceType;
  if (params.cloudProvider) where.cloud_provider = params.cloudProvider;

  const cursorObj = params.cursor ? { id: params.cursor } : undefined;

  const assignments = await prisma.resourceTagAssignment.findMany({
    where,
    take: limit + 1,
    orderBy: { assigned_at: 'desc' },
    ...(cursorObj ? { cursor: cursorObj, skip: 1 } : {}),
  });

  const hasMore = assignments.length > limit;
  const data = hasMore ? assignments.slice(0, limit) : assignments;

  return {
    data,
    nextCursor: hasMore ? data[data.length - 1].id : null,
  };
}

// ============================================================================
// GET UNTAGGED RESOURCES
// ============================================================================

export async function getUntaggedResources(
  organizationId: string,
  params: {
    limit?: number;
    cursor?: string;
    resourceType?: string;
    cloudProvider?: string;
    region?: string;
    accountId?: string;
  }
) {
  const prisma = getPrismaClient();
  const limit = Math.min(Math.max(params.limit || 50, 1), 100);

  // Get already-tagged resource IDs
  const taggedResourceIds = (await prisma.resourceTagAssignment.findMany({
    where: { organization_id: organizationId },
    select: { resource_id: true },
    distinct: ['resource_id'],
  })).map((a: any) => a.resource_id);

  // Try ResourceInventory first
  try {
    const riCount = await prisma.resourceInventory.count({
      where: { organization_id: organizationId },
    });

    if (riCount > 0) {
      const where: any = {
        organization_id: organizationId,
        ...(taggedResourceIds.length > 0 ? { NOT: { resource_id: { in: taggedResourceIds } } } : {}),
      };
      if (params.resourceType) where.resource_type = params.resourceType;
      if (params.cloudProvider) where.cloud_provider = params.cloudProvider;
      if (params.region) where.region = params.region;

      const cursorObj = params.cursor ? { id: params.cursor } : undefined;

      const resources = await prisma.resourceInventory.findMany({
        where,
        take: limit + 1,
        orderBy: { updated_at: 'desc' },
        ...(cursorObj ? { cursor: cursorObj, skip: 1 } : {}),
      });

      const hasMore = resources.length > limit;
      const data = hasMore ? resources.slice(0, limit) : resources;
      return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
    }
  } catch {
    // ResourceInventory may not exist
  }

  // Fallback: derive "resources" from daily_costs distinct services
  try {
    const offset = params.cursor ? parseInt(params.cursor, 10) || 0 : 0;

    const resources: any[] = await prisma.$queryRaw`
      SELECT 
        service || '::' || COALESCE(aws_account_id::text, COALESCE(azure_credential_id::text, 'unknown')) as id,
        service as resource_name,
        service as resource_type,
        COALESCE(cloud_provider, 'AWS') as cloud_provider,
        COALESCE(aws_account_id::text, azure_credential_id::text) as account_id,
        '' as region,
        SUM(cost) as total_cost,
        MAX(date) as last_seen
      FROM daily_costs
      WHERE organization_id = ${organizationId}::uuid
      GROUP BY service, cloud_provider, aws_account_id, azure_credential_id
      ORDER BY SUM(cost) DESC
      LIMIT ${limit + 1}
      OFFSET ${offset}
    `;

    // Filter out already-tagged
    const filtered = resources.filter((r: any) => !taggedResourceIds.includes(r.id));
    const hasMore = filtered.length > limit;
    const data = hasMore ? filtered.slice(0, limit) : filtered;
    const nextOffset = offset + limit;

    return {
      data: data.map((r: any) => ({
        id: r.id,
        resource_id: r.id,
        resource_name: r.resource_name,
        resource_type: r.resource_type,
        cloud_provider: r.cloud_provider,
        region: r.region || '',
        aws_account_id: r.account_id,
        total_cost: Number(r.total_cost || 0),
        last_seen: r.last_seen,
        source: 'daily_costs',
      })),
      nextCursor: hasMore ? String(nextOffset) : null,
    };
  } catch (err: any) {
    logger.warn('getUntaggedResources daily_costs fallback error', { error: err.message });
    return { data: [], nextCursor: null };
  }
}

// ============================================================================
// RECENT ACTIVITY (Melhoria 5)
// ============================================================================

export async function getRecentActivity(organizationId: string, limit: number = 10) {
  const prisma = getPrismaClient();
  const safeLimit = Math.min(Math.max(limit, 1), 50);

  const assignments = await prisma.resourceTagAssignment.findMany({
    where: { organization_id: organizationId },
    include: { tag: true },
    orderBy: { assigned_at: 'desc' },
    take: safeLimit,
  });

  return assignments.map((a: any) => ({
    id: a.id,
    tag_key: a.tag?.key,
    tag_value: a.tag?.value,
    tag_color: a.tag?.color,
    tag_id: a.tag_id,
    resource_id: a.resource_id,
    resource_name: a.resource_name,
    resource_type: a.resource_type,
    cloud_provider: a.cloud_provider,
    assigned_by: a.assigned_by,
    assigned_at: a.assigned_at,
  }));
}

// ============================================================================
// GET ALL RESOURCES — tagged + untagged (Melhoria 3)
// ============================================================================

export async function getAllResources(
  organizationId: string,
  params: { limit?: number; cursor?: string; resourceType?: string; cloudProvider?: string }
) {
  const prisma = getPrismaClient();
  const limit = Math.min(Math.max(params.limit || 100, 1), 200);
  const offset = params.cursor ? parseInt(params.cursor, 10) || 0 : 0;

  try {
    const resources: any[] = await prisma.$queryRaw`
      SELECT 
        service || '::' || COALESCE(aws_account_id::text, COALESCE(azure_credential_id::text, 'unknown')) as id,
        service as resource_name,
        service as resource_type,
        COALESCE(cloud_provider, 'AWS') as cloud_provider,
        COALESCE(aws_account_id::text, azure_credential_id::text) as account_id,
        SUM(cost) as total_cost,
        MAX(date) as last_seen
      FROM daily_costs
      WHERE organization_id = ${organizationId}::uuid
      GROUP BY service, cloud_provider, aws_account_id, azure_credential_id
      ORDER BY SUM(cost) DESC
      LIMIT ${limit + 1}
      OFFSET ${offset}
    `;

    // Get tagged resource IDs to mark which are tagged
    const taggedResourceIds = new Set(
      (await prisma.resourceTagAssignment.findMany({
        where: { organization_id: organizationId },
        select: { resource_id: true },
        distinct: ['resource_id'],
      })).map((a: any) => a.resource_id)
    );

    const hasMore = resources.length > limit;
    const data = hasMore ? resources.slice(0, limit) : resources;

    return {
      data: data.map((r: any) => ({
        id: r.id,
        resource_id: r.id,
        resource_name: r.resource_name,
        resource_type: r.resource_type,
        cloud_provider: r.cloud_provider,
        aws_account_id: r.account_id,
        total_cost: Number(r.total_cost || 0),
        last_seen: r.last_seen,
        is_tagged: taggedResourceIds.has(r.id),
        source: 'daily_costs',
      })),
      nextCursor: hasMore ? String(offset + limit) : null,
    };
  } catch (err: any) {
    logger.warn('getAllResources error', { error: err.message });
    return { data: [], nextCursor: null };
  }
}

// ============================================================================
// ENRICH LEGACY ASSIGNMENTS (Melhoria 6)
// ============================================================================

export async function enrichLegacyAssignments(organizationId: string) {
  const prisma = getPrismaClient();

  // Find assignments with resource_type='unknown' or empty resource_name
  const legacyAssignments = await prisma.resourceTagAssignment.findMany({
    where: {
      organization_id: organizationId,
      OR: [
        { resource_type: 'unknown' },
        { resource_name: null },
        { resource_name: '' },
      ],
    },
  });

  if (legacyAssignments.length === 0) return { enriched: 0, total: 0 };

  let enriched = 0;
  for (const assignment of legacyAssignments) {
    // Try to match resource_id against daily_costs
    const resourceId = assignment.resource_id;
    // resource_id format: "service::accountId"
    const parts = resourceId.split('::');
    if (parts.length >= 2) {
      const serviceName = parts[0];
      const accountId = parts[1];

      try {
        await prisma.resourceTagAssignment.update({
          where: { id: assignment.id },
          data: {
            resource_type: serviceName,
            resource_name: serviceName,
            cloud_provider: assignment.cloud_provider || 'AWS',
            aws_account_id: accountId !== 'unknown' ? accountId : null,
          },
        });
        enriched++;
      } catch (err: any) {
        logger.warn('enrichLegacyAssignments update error', { id: assignment.id, error: err.message });
      }
    }
  }

  return { enriched, total: legacyAssignments.length };
}
