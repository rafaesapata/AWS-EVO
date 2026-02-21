/**
 * Tag Service — Smart Resource Tagging
 * Business logic for tag CRUD, suggestions, templates, and coverage
 */

import { getPrismaClient } from '../database.js';
import { logger } from '../logger.js';
import {
  normalizeTagKey, normalizeTagValue, sanitizeHtml,
  validateCreateTagInput, validateUpdateTagInput,
  MAX_TAGS_PER_ORG, TAG_CATEGORIES, PREDEFINED_COLORS,
  type CreateTagInput, type UpdateTagInput, type TagCategory,
} from './tag-validation.js';
import {
  getCachedUsageCount, setCachedUsageCount,
  getCachedCoverage, setCachedCoverage,
  getCachedSuggestions, setCachedSuggestions,
  invalidateTagList, invalidateOnAssignmentChange,
} from './tag-cache.js';

// ============================================================================
// TYPES
// ============================================================================

interface ListTagsParams {
  organizationId: string;
  category?: string;
  key?: string;
  search?: string;
  sortBy?: 'usage_count' | 'key' | 'created_at';
  limit?: number;
  cursor?: string;
}

// ============================================================================
// CREATE TAG
// ============================================================================

export async function createTag(
  organizationId: string,
  userId: string,
  input: CreateTagInput
) {
  const validation = validateCreateTagInput(input);
  if (!validation.valid) {
    return { error: 'VALIDATION_ERROR', statusCode: 422, errors: validation.errors };
  }

  const key = sanitizeHtml(normalizeTagKey(input.key));
  const value = sanitizeHtml(normalizeTagValue(input.value));
  const description = input.description ? sanitizeHtml(input.description) : null;
  const category = (input.category || 'CUSTOM') as TagCategory;

  const prisma = getPrismaClient();

  // Check org tag limit
  const tagCount = await prisma.tag.count({ where: { organization_id: organizationId } });
  if (tagCount >= MAX_TAGS_PER_ORG) {
    return {
      error: 'TAG_LIMIT_EXCEEDED',
      statusCode: 422,
      message: `Organization tag limit reached (${MAX_TAGS_PER_ORG})`,
    };
  }

  // Check duplicate
  const existing = await prisma.tag.findUnique({
    where: { uq_tag_org_key_value: { organization_id: organizationId, key, value } },
  });
  if (existing) {
    return {
      error: 'DUPLICATE_TAG',
      statusCode: 409,
      message: `Tag with key '${key}' and value '${value}' already exists`,
      existingTagId: existing.id,
    };
  }

  const tag = await prisma.tag.create({
    data: {
      organization_id: organizationId,
      key,
      value,
      color: input.color,
      category,
      description,
      created_by: userId,
    },
  });

  await invalidateTagList(organizationId);
  return { data: tag };
}

// ============================================================================
// LIST TAGS
// ============================================================================

export async function listTags(params: ListTagsParams) {
  const prisma = getPrismaClient();
  const limit = Math.min(Math.max(params.limit || 50, 1), 100);

  const where: any = { organization_id: params.organizationId };
  if (params.category) where.category = params.category;
  if (params.key) where.key = { startsWith: params.key };
  if (params.search) {
    where.OR = [
      { key: { contains: params.search, mode: 'insensitive' } },
      { value: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  const orderBy: any = params.sortBy === 'key'
    ? { key: 'asc' }
    : params.sortBy === 'usage_count'
      ? { created_at: 'desc' }
      : { created_at: 'desc' };

  const cursorObj = params.cursor ? { id: params.cursor } : undefined;

  const [totalCount, tags] = await Promise.all([
    prisma.tag.count({ where }),
    prisma.tag.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(cursorObj ? { cursor: cursorObj, skip: 1 } : {}),
    }),
  ]);

  const hasMore = tags.length > limit;
  const data = hasMore ? tags.slice(0, limit) : tags;

  // Enrich with usage counts
  const enriched = await Promise.all(
    data.map(async (tag: any) => {
      let usageCount = await getCachedUsageCount(params.organizationId, tag.id);
      if (usageCount === null) {
        usageCount = await prisma.resourceTagAssignment.count({
          where: { organization_id: params.organizationId, tag_id: tag.id },
        });
        await setCachedUsageCount(params.organizationId, tag.id, usageCount);
      }
      return { ...tag, usage_count: usageCount };
    })
  );

  if (params.sortBy === 'usage_count') {
    enriched.sort((a: any, b: any) => b.usage_count - a.usage_count);
  }

  return {
    tags: enriched,
    total: totalCount,
    nextCursor: hasMore ? data[data.length - 1].id : null,
  };
}

// ============================================================================
// GET TAG DETAILS
// ============================================================================

export async function getTagDetails(organizationId: string, tagId: string) {
  const prisma = getPrismaClient();

  const tag = await prisma.tag.findFirst({
    where: { id: tagId, organization_id: organizationId },
  });

  if (!tag) return { error: 'NOT_FOUND', statusCode: 404, message: 'Tag not found' };

  // Usage breakdown
  const assignments = await prisma.resourceTagAssignment.groupBy({
    by: ['resource_type', 'cloud_provider'],
    where: { tag_id: tagId, organization_id: organizationId },
    _count: true,
  });

  const totalCount = assignments.reduce((sum: number, a: any) => sum + a._count, 0);

  const byResourceType = assignments
    .reduce((acc: any[], a: any) => {
      const existing = acc.find((x: any) => x.resource_type === a.resource_type);
      if (existing) existing.count += a._count;
      else acc.push({ resource_type: a.resource_type, count: a._count });
      return acc;
    }, [])
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, 10);

  const byProvider = assignments.reduce((acc: any, a: any) => {
    acc[a.cloud_provider] = (acc[a.cloud_provider] || 0) + a._count;
    return acc;
  }, {} as Record<string, number>);

  return {
    data: {
      ...tag,
      usage: { total: totalCount, byResourceType, byProvider },
    },
  };
}

// ============================================================================
// UPDATE TAG
// ============================================================================

export async function updateTag(
  organizationId: string,
  tagId: string,
  userId: string,
  input: UpdateTagInput
) {
  const validation = validateUpdateTagInput(input);
  if (!validation.valid) {
    return { error: 'VALIDATION_ERROR', statusCode: 422, errors: validation.errors };
  }

  const prisma = getPrismaClient();
  const existing = await prisma.tag.findFirst({
    where: { id: tagId, organization_id: organizationId },
  });

  if (!existing) return { error: 'NOT_FOUND', statusCode: 404, message: 'Tag not found' };

  const updateData: any = {};
  if (input.color !== undefined) updateData.color = input.color;
  if (input.category !== undefined) updateData.category = input.category;
  if (input.description !== undefined) updateData.description = input.description ? sanitizeHtml(input.description) : null;

  const tag = await prisma.tag.update({
    where: { id: tagId },
    data: updateData,
  });

  await invalidateTagList(organizationId);
  return { data: tag, oldValues: { color: existing.color, category: existing.category, description: existing.description } };
}

// ============================================================================
// DELETE TAG
// ============================================================================

export async function deleteTag(organizationId: string, tagId: string) {
  const prisma = getPrismaClient();

  const existing = await prisma.tag.findFirst({
    where: { id: tagId, organization_id: organizationId },
  });

  if (!existing) return { error: 'NOT_FOUND', statusCode: 404, message: 'Tag not found' };

  // Count assignments before deletion
  const assignmentCount = await prisma.resourceTagAssignment.count({
    where: { tag_id: tagId, organization_id: organizationId },
  });

  // Cascade delete via Prisma (onDelete: Cascade on assignments)
  await prisma.tag.delete({ where: { id: tagId } });

  await invalidateTagList(organizationId);
  return { data: { tagId, key: existing.key, value: existing.value, assignmentsRemoved: assignmentCount } };
}

// ============================================================================
// SMART SUGGESTIONS
// ============================================================================

export async function getSuggestions(
  organizationId: string,
  resourceType: string,
  resourceName: string,
  accountId: string,
  region: string
) {
  // Check cache
  const cached = await getCachedSuggestions(organizationId, resourceType, accountId);
  if (cached) return { data: cached };

  const prisma = getPrismaClient();

  // Get all org tags with assignment counts
  const tags = await prisma.tag.findMany({
    where: { organization_id: organizationId },
    include: { _count: { select: { assignments: true } } },
  });

  if (tags.length === 0) {
    await setCachedSuggestions(organizationId, resourceType, accountId, []);
    return { data: [] };
  }

  const tagIds = tags.map((t: any) => t.id);

  // Batch query: get all tag_ids that have assignments for this resource_type
  const typeMatches = await prisma.resourceTagAssignment.groupBy({
    by: ['tag_id'],
    where: {
      tag_id: { in: tagIds },
      organization_id: organizationId,
      resource_type: resourceType,
    },
    _count: { _all: true },
  });
  const typeMatchSet = new Set(typeMatches.map((m: any) => m.tag_id));

  // Batch query: get all tag_ids that match account + region
  let regionMatchSet = new Set<string>();
  if (accountId && region) {
    const accountFilter: any[] = [{ aws_account_id: accountId }];
    if (accountId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      accountFilter.push({ azure_credential_id: accountId });
    }
    const regionMatches = await prisma.resourceTagAssignment.groupBy({
      by: ['tag_id'],
      where: {
        tag_id: { in: tagIds },
        organization_id: organizationId,
        OR: accountFilter,
        resource_region: region,
      },
      _count: { _all: true },
    });
    regionMatchSet = new Set(regionMatches.map((m: any) => m.tag_id));
  }

  // Score each tag (no more N+1 queries)
  const scored = tags.map((tag: any) => {
    let score = 0;

    if (typeMatchSet.has(tag.id)) {
      score = 3;
    } else if (regionMatchSet.has(tag.id)) {
      score = 2;
    } else if (resourceName) {
      const nameLower = resourceName.toLowerCase();
      if ((tag.key && nameLower.includes(tag.key.toLowerCase())) || (tag.value && nameLower.includes(tag.value.toLowerCase()))) {
        score = 1;
      }
    }

    return { ...tag, score, usage_count: tag._count.assignments };
  });

  // Filter, sort, limit
  const suggestions = scored
    .filter((s: any) => s.score > 0)
    .sort((a: any, b: any) => b.score - a.score || b.usage_count - a.usage_count)
    .slice(0, 10)
    .map(({ _count, ...rest }: any) => rest);

  await setCachedSuggestions(organizationId, resourceType, accountId, suggestions);
  return { data: suggestions };
}

// ============================================================================
// TEMPLATES
// ============================================================================

const TAG_TEMPLATES = [
  {
    id: 'environment',
    name: 'Environment',
    description: 'Classify resources by deployment environment',
    tags: [
      { key: 'env', value: 'production', color: '#EF4444', category: 'ENVIRONMENT' },
      { key: 'env', value: 'staging', color: '#F97316', category: 'ENVIRONMENT' },
      { key: 'env', value: 'development', color: '#22C55E', category: 'ENVIRONMENT' },
      { key: 'env', value: 'testing', color: '#06B6D4', category: 'ENVIRONMENT' },
    ],
  },
  {
    id: 'cost-center',
    name: 'Cost Center',
    description: 'Track costs by business unit',
    tags: [
      { key: 'cost-center', value: 'engineering', color: '#3B82F6', category: 'COST_CENTER' },
      { key: 'cost-center', value: 'marketing', color: '#EC4899', category: 'COST_CENTER' },
      { key: 'cost-center', value: 'operations', color: '#F59E0B', category: 'COST_CENTER' },
      { key: 'cost-center', value: 'sales', color: '#8B5CF6', category: 'COST_CENTER' },
    ],
  },
  {
    id: 'team',
    name: 'Team',
    description: 'Assign resources to teams',
    tags: [
      { key: 'team', value: 'backend', color: '#6366F1', category: 'TEAM' },
      { key: 'team', value: 'frontend', color: '#14B8A6', category: 'TEAM' },
      { key: 'team', value: 'devops', color: '#F97316', category: 'TEAM' },
      { key: 'team', value: 'data', color: '#84CC16', category: 'TEAM' },
    ],
  },
  {
    id: 'criticality',
    name: 'Criticality',
    description: 'Mark resource criticality level',
    tags: [
      { key: 'criticality', value: 'critical', color: '#EF4444', category: 'CRITICALITY' },
      { key: 'criticality', value: 'high', color: '#F97316', category: 'CRITICALITY' },
      { key: 'criticality', value: 'medium', color: '#F59E0B', category: 'CRITICALITY' },
      { key: 'criticality', value: 'low', color: '#64748B', category: 'CRITICALITY' },
    ],
  },
  {
    id: 'project',
    name: 'Project',
    description: 'Group resources by project',
    tags: [
      { key: 'project', value: 'main-app', color: '#3B82F6', category: 'PROJECT' },
      { key: 'project', value: 'microservices', color: '#8B5CF6', category: 'PROJECT' },
      { key: 'project', value: 'data-pipeline', color: '#22C55E', category: 'PROJECT' },
    ],
  },
  {
    id: 'compliance',
    name: 'Compliance',
    description: 'Track compliance requirements',
    tags: [
      { key: 'compliance', value: 'pci-dss', color: '#EF4444', category: 'COMPLIANCE' },
      { key: 'compliance', value: 'hipaa', color: '#F97316', category: 'COMPLIANCE' },
      { key: 'compliance', value: 'soc2', color: '#3B82F6', category: 'COMPLIANCE' },
      { key: 'compliance', value: 'gdpr', color: '#6366F1', category: 'COMPLIANCE' },
    ],
  },
];

export function getTemplates() {
  return { data: TAG_TEMPLATES };
}

export async function applyTemplates(
  organizationId: string,
  userId: string,
  templateIds: string[]
) {
  const prisma = getPrismaClient();
  const selectedTemplates = TAG_TEMPLATES.filter((t) => templateIds.includes(t.id));

  let createdCount = 0;
  let skippedCount = 0;
  const createdTags: any[] = [];
  const skippedTags: any[] = [];

  for (const template of selectedTemplates) {
    for (const tagDef of template.tags) {
      const existing = await prisma.tag.findUnique({
        where: {
          uq_tag_org_key_value: {
            organization_id: organizationId,
            key: tagDef.key,
            value: tagDef.value,
          },
        },
      });

      if (existing) {
        skippedCount++;
        skippedTags.push({ key: tagDef.key, value: tagDef.value, reason: 'already_exists' });
        continue;
      }

      const tag = await prisma.tag.create({
        data: {
          organization_id: organizationId,
          key: tagDef.key,
          value: tagDef.value,
          color: tagDef.color,
          category: tagDef.category as any,
          created_by: userId,
        },
      });

      createdCount++;
      createdTags.push(tag);
    }
  }

  await invalidateTagList(organizationId);
  return { data: { createdCount, skippedCount, createdTags, skippedTags } };
}

// ============================================================================
// COVERAGE
// ============================================================================

export async function getCoverage(organizationId: string) {
  const cached = await getCachedCoverage(organizationId);
  if (cached) return { data: cached };

  const prisma = getPrismaClient();

  // Try ResourceInventory first, fallback to daily_costs distinct services
  let totalResources = 0;
  let resourceSource = 'resource_inventory';
  try {
    totalResources = await prisma.resourceInventory.count({
      where: { organization_id: organizationId },
    });
  } catch {
    totalResources = 0;
  }

  if (totalResources === 0) {
    // Fallback: count distinct services from daily_costs as "resources"
    resourceSource = 'daily_costs';
    try {
      const distinctServices: any[] = await prisma.$queryRaw`
        SELECT COUNT(DISTINCT service || '::' || COALESCE(aws_account_id::text, COALESCE(azure_credential_id::text, ''))) as cnt
        FROM daily_costs
        WHERE organization_id = ${organizationId}::uuid
      `;
      totalResources = Number(distinctServices[0]?.cnt || 0);
    } catch (err: any) {
      logger.warn('getCoverage daily_costs fallback error', { error: err.message });
      totalResources = 0;
    }
  }

  // Tagged resources (distinct resource_ids with at least one assignment)
  const taggedResult = await prisma.resourceTagAssignment.groupBy({
    by: ['resource_id'],
    where: { organization_id: organizationId },
  });
  const taggedResources = taggedResult.length;

  const untaggedResources = Math.max(0, totalResources - taggedResources);
  const coveragePercentage = totalResources > 0
    ? Math.round((taggedResources / totalResources) * 1000) / 10
    : 0;

  // Breakdown by provider
  let breakdownByProvider: Record<string, number> = {};

  if (resourceSource === 'daily_costs') {
    // Get provider breakdown from daily_costs
    try {
      const providerCounts: any[] = await prisma.$queryRaw`
        SELECT cloud_provider, COUNT(DISTINCT service || '::' || COALESCE(aws_account_id::text, COALESCE(azure_credential_id::text, ''))) as cnt
        FROM daily_costs
        WHERE organization_id = ${organizationId}::uuid
        GROUP BY cloud_provider
      `;
      breakdownByProvider = providerCounts.reduce((acc: any, p: any) => {
        acc[p.cloud_provider || 'AWS'] = Number(p.cnt || 0);
        return acc;
      }, {} as Record<string, number>);
    } catch {
      // ignore
    }
  } else {
    const providerBreakdown = await prisma.resourceTagAssignment.groupBy({
      by: ['cloud_provider'],
      where: { organization_id: organizationId },
      _count: { _all: true },
    });
    breakdownByProvider = providerBreakdown.reduce((acc: any, p: any) => {
      acc[p.cloud_provider] = p._count._all;
      return acc;
    }, {} as Record<string, number>);
  }

  const coverage = {
    totalResources,
    taggedResources,
    untaggedResources,
    coveragePercentage,
    breakdownByProvider,
    resourceSource,
  };

  await setCachedCoverage(organizationId, coverage);
  return { data: coverage };
}
