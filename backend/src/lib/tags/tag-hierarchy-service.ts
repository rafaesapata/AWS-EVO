/**
 * Tag Hierarchy Service — Parent-child relationships + merge/rename
 */

import { getPrismaClient } from '../database.js';
import { logger } from '../logger.js';
import { invalidateTagList, invalidateOnAssignmentChange } from './tag-cache.js';

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
    // Prevent circular: check if tagId is ancestor of parentId
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

  // Build tree
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

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = await prisma.tag.findMany({
      where: { organization_id: organizationId, parent_id: current },
      select: { id: true },
    });
    for (const child of children) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }

  return ids;
}

async function getAncestors(organizationId: string, tagId: string): Promise<any[]> {
  const prisma = getPrismaClient();
  const ancestors: any[] = [];
  let currentId: string | null = tagId;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const tag: any = await prisma.tag.findFirst({
      where: { id: currentId, organization_id: organizationId },
    });
    if (!tag || !tag.parent_id) break;
    ancestors.push(tag);
    currentId = tag.parent_id;
  }

  return ancestors;
}

// ============================================================================
// MERGE TAGS (Melhoria 9)
// ============================================================================

export async function mergeTags(
  organizationId: string,
  userId: string,
  sourceTagIds: string[],
  targetTagId: string
) {
  const prisma = getPrismaClient();

  // Validate target
  const target = await prisma.tag.findFirst({
    where: { id: targetTagId, organization_id: organizationId },
  });
  if (!target) throw new Error('Target tag not found');

  // Validate sources
  const sources = await prisma.tag.findMany({
    where: { id: { in: sourceTagIds }, organization_id: organizationId },
  });
  if (sources.length === 0) throw new Error('No valid source tags found');

  const validSourceIds = sources.map((s: any) => s.id).filter((id: string) => id !== targetTagId);
  if (validSourceIds.length === 0) throw new Error('No source tags to merge (cannot merge tag into itself)');

  let migratedCount = 0;
  let skippedCount = 0;

  for (const sourceId of validSourceIds) {
    // Get all assignments from source
    const sourceAssignments = await prisma.resourceTagAssignment.findMany({
      where: { organization_id: organizationId, tag_id: sourceId },
    });

    for (const assignment of sourceAssignments) {
      // Check if target already has this resource
      const existing = await prisma.resourceTagAssignment.findUnique({
        where: {
          uq_assignment_org_tag_resource: {
            organization_id: organizationId,
            tag_id: targetTagId,
            resource_id: assignment.resource_id,
          },
        },
      });

      if (existing) {
        skippedCount++;
      } else {
        // Migrate assignment to target tag
        await prisma.resourceTagAssignment.update({
          where: { id: assignment.id },
          data: { tag_id: targetTagId },
        });
        migratedCount++;
      }
    }

    // Re-parent children of source to target
    await prisma.tag.updateMany({
      where: { parent_id: sourceId, organization_id: organizationId },
      data: { parent_id: targetTagId },
    });

    // Delete remaining assignments (duplicates that were skipped)
    await prisma.resourceTagAssignment.deleteMany({
      where: { organization_id: organizationId, tag_id: sourceId },
    });

    // Delete source tag
    await prisma.tag.delete({ where: { id: sourceId } });
  }

  // Invalidate caches
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
// RENAME TAG (Melhoria 9)
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

  // Check for duplicate with new key:value
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
