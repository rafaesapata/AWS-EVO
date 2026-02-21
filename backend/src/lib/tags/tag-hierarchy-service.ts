/**
 * Tag Hierarchy Service — Parent-child relationships + merge/rename
 * Melhoria 6: mergeTags uses batch operations instead of N+1 loop
 * Melhoria 7: getAncestors has maxDepth safety net
 */

import { getPrismaClient } from '../database.js';
import { logger } from '../logger.js';
import { invalidateTagList, invalidateOnAssignmentChange } from './tag-cache.js';

const MAX_HIERARCHY_DEPTH = 20;

// ============================================================================
// HIERARCHY
// ============================================================================

export async function setTagParent(organizationId: string, tagId: string, parentId: string | null) {
  const prisma = getPrismaClient();
  const tag = await prisma.tag.findFirst({ where: { id: tagId, organization_id: organizationId } });
  if (!tag) throw new Error('Tag not found');

  if (parentId) {
    const parent = await prisma.tag.findFirst({ where: { id: parentId, organization_id: organizationId } });
    if (!parent) throw new Error('Parent tag not found');
    if (parentId === tagId) throw new Error('Tag cannot be its own parent');
    const ancestors = await getAncestors(organizationId, parentId);
    if (ancestors.some((a: any) => a.id === tagId)) throw new Error('Circular hierarchy detected');
  }

  const updated = await prisma.tag.update({
    where: { id: tagId },
    data: { parent_id: parentId },
  });
  await invalidateTagList(organizationId);
  return updated;
}

export async function getTagTree(organizationId: string) {
  const prisma = getPrismaClient();
  const allTags = await prisma.tag.findMany({
    where: { organization_id: organizationId },
    include: { _count: { select: { assignments: true } } },
    orderBy: { key: 'asc' },
  });

  const tagMap = new Map<string, any>();
  const roots: any[] = [];

  for (const tag of allTags) {
    tagMap.set(tag.id, { ...tag, usage_count: (tag as any)._count.assignments, children: [] });
  }

  for (const tag of allTags) {
    const node = tagMap.get(tag.id);
    if (tag.parent_id && tagMap.has(tag.parent_id)) {
      tagMap.get(tag.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function getDescendants(organizationId: string, tagId: string): Promise<string[]> {
  const prisma = getPrismaClient();
  const ids: string[] = [tagId];
  const queue = [tagId];
  let depth = 0;

  while (queue.length > 0 && depth < MAX_HIERARCHY_DEPTH) {
    const current = queue.shift()!;
    const children = await prisma.tag.findMany({
      where: { organization_id: organizationId, parent_id: current },
      select: { id: true },
    });
    for (const child of children) {
      ids.push(child.id);
      queue.push(child.id);
    }
    depth++;
  }

  return ids;
}

// Melhoria 7: maxDepth safety net to prevent infinite loops on corrupted data
async function getAncestors(organizationId: string, tagId: string): Promise<any[]> {
  const prisma = getPrismaClient();
  const ancestors: any[] = [];
  let currentId: string | null = tagId;
  const visited = new Set<string>();
  let depth = 0;

  while (currentId && depth < MAX_HIERARCHY_DEPTH) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const tag: any = await prisma.tag.findFirst({
      where: { id: currentId, organization_id: organizationId },
    });
    if (!tag || !tag.parent_id) break;
    ancestors.push(tag);
    currentId = tag.parent_id;
    depth++;
  }

  return ancestors;
}

// ============================================================================
// MERGE TAGS (Melhoria 6: batch operations instead of N+1 loop)
// ============================================================================

export async function mergeTags(
  organizationId: string,
  userId: string,
  sourceTagIds: string[],
  targetTagId: string
) {
  const prisma = getPrismaClient();

  const target = await prisma.tag.findFirst({
    where: { id: targetTagId, organization_id: organizationId },
  });
  if (!target) throw new Error('Target tag not found');

  const sources = await prisma.tag.findMany({
    where: { id: { in: sourceTagIds }, organization_id: organizationId },
  });
  if (sources.length === 0) throw new Error('No valid source tags found');

  const validSourceIds = sources.map((s: any) => s.id).filter((id: string) => id !== targetTagId);
  if (validSourceIds.length === 0) throw new Error('No source tags to merge (cannot merge tag into itself)');

  let migratedCount = 0;
  let skippedCount = 0;

  // Batch: get ALL source assignments in 1 query
  const sourceAssignments = await prisma.resourceTagAssignment.findMany({
    where: { organization_id: organizationId, tag_id: { in: validSourceIds } },
  });

  // Batch: get ALL existing target assignments in 1 query
  const targetAssignments = await prisma.resourceTagAssignment.findMany({
    where: { organization_id: organizationId, tag_id: targetTagId },
    select: { resource_id: true },
  });
  const targetResourceSet = new Set(targetAssignments.map((a: any) => a.resource_id));

  // Separate: migratable vs duplicates
  const toMigrateIds: string[] = [];
  const toDeleteIds: string[] = [];

  for (const assignment of sourceAssignments) {
    if (targetResourceSet.has(assignment.resource_id)) {
      // Duplicate — will be deleted
      toDeleteIds.push(assignment.id);
      skippedCount++;
    } else {
      // Can migrate to target
      toMigrateIds.push(assignment.id);
      targetResourceSet.add(assignment.resource_id); // prevent duplicates within batch
      migratedCount++;
    }
  }

  // Batch: migrate assignments to target tag (1 query)
  if (toMigrateIds.length > 0) {
    await prisma.resourceTagAssignment.updateMany({
      where: { id: { in: toMigrateIds } },
      data: { tag_id: targetTagId },
    });
  }

  // Batch: delete duplicate assignments (1 query)
  if (toDeleteIds.length > 0) {
    await prisma.resourceTagAssignment.deleteMany({
      where: { id: { in: toDeleteIds } },
    });
  }

  // Re-parent children of sources to target (1 query)
  await prisma.tag.updateMany({
    where: { parent_id: { in: validSourceIds }, organization_id: organizationId },
    data: { parent_id: targetTagId },
  });

  // Delete source tags (1 query)
  await prisma.tag.deleteMany({
    where: { id: { in: validSourceIds }, organization_id: organizationId },
  });

  await invalidateTagList(organizationId);
  await invalidateOnAssignmentChange(organizationId, targetTagId);

  return {
    targetTag: target,
    mergedCount: validSourceIds.length,
    migratedAssignments: migratedCount,
    skippedDuplicates: skippedCount,
    deletedTags: sources.map((s: any) => ({ id: s.id, key: s.key, value: s.value })),
  };
}

// ============================================================================
// RENAME TAG
// ============================================================================

export async function renameTag(
  organizationId: string,
  tagId: string,
  newKey: string,
  newValue: string
) {
  const prisma = getPrismaClient();

  const tag = await prisma.tag.findFirst({
    where: { id: tagId, organization_id: organizationId },
  });
  if (!tag) throw new Error('Tag not found');

  const duplicate = await prisma.tag.findUnique({
    where: {
      uq_tag_org_key_value: {
        organization_id: organizationId,
        key: newKey.trim().toLowerCase(),
        value: newValue.trim().toLowerCase(),
      },
    },
  });
  if (duplicate && duplicate.id !== tagId) {
    throw new Error(`Tag ${newKey}:${newValue} already exists. Use merge instead.`);
  }

  const updated = await prisma.tag.update({
    where: { id: tagId },
    data: {
      key: newKey.trim().toLowerCase(),
      value: newValue.trim().toLowerCase(),
    },
  });

  await invalidateTagList(organizationId);
  return { oldKey: tag.key, oldValue: tag.value, tag: updated };
}
