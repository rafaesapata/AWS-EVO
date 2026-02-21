/**
 * Tag Auto-Rules Engine — Automatic tagging based on resource conditions
 */

import { getPrismaClient } from '../database.js';
import { logger } from '../logger.js';
import { invalidateOnAssignmentChange } from './tag-cache.js';

export interface RuleCondition {
  field: 'service' | 'cloud_provider' | 'account_id' | 'resource_name' | 'cost_gt' | 'cost_lt';
  operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex' | 'gt' | 'lt';
  value: string;
}

export interface AutoRuleInput {
  name: string;
  description?: string;
  conditions: RuleCondition[];
  tagIds: string[];
  isActive?: boolean;
}

// ============================================================================
// CRUD
// ============================================================================

export async function listAutoRules(organizationId: string) {
  const prisma = getPrismaClient();
  const rules = await (prisma as any).tagAutoRule.findMany({
    where: { organization_id: organizationId },
    orderBy: { created_at: 'desc' },
  });
  return rules;
}

export async function createAutoRule(organizationId: string, userId: string, input: AutoRuleInput) {
  const prisma = getPrismaClient();
  if (!input.name || input.name.length > 128) throw new Error('Rule name is required (max 128 chars)');
  if (!input.conditions || input.conditions.length === 0) throw new Error('At least one condition is required');
  if (!input.tagIds || input.tagIds.length === 0) throw new Error('At least one tag is required');

  // Verify tags exist
  const tags = await prisma.tag.findMany({
    where: { id: { in: input.tagIds }, organization_id: organizationId },
  });
  if (tags.length !== input.tagIds.length) throw new Error('One or more tags not found');

  return (prisma as any).tagAutoRule.create({
    data: {
      organization_id: organizationId,
      name: input.name,
      description: input.description || null,
      conditions: input.conditions,
      tag_ids: input.tagIds,
      is_active: input.isActive !== false,
      created_by: userId,
    },
  });
}

export async function updateAutoRule(organizationId: string, ruleId: string, input: Partial<AutoRuleInput>) {
  const prisma = getPrismaClient();
  const existing = await (prisma as any).tagAutoRule.findFirst({
    where: { id: ruleId, organization_id: organizationId },
  });
  if (!existing) throw new Error('Rule not found');

  const data: any = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.conditions !== undefined) data.conditions = input.conditions;
  if (input.tagIds !== undefined) data.tag_ids = input.tagIds;
  if (input.isActive !== undefined) data.is_active = input.isActive;

  return (prisma as any).tagAutoRule.update({ where: { id: ruleId }, data });
}

export async function deleteAutoRule(organizationId: string, ruleId: string) {
  const prisma = getPrismaClient();
  const existing = await (prisma as any).tagAutoRule.findFirst({
    where: { id: ruleId, organization_id: organizationId },
  });
  if (!existing) throw new Error('Rule not found');
  await (prisma as any).tagAutoRule.delete({ where: { id: ruleId } });
  return { deleted: true };
}


// ============================================================================
// RULE EXECUTION ENGINE
// ============================================================================

function matchesCondition(resource: any, condition: RuleCondition): boolean {
  let fieldValue: string | number;

  switch (condition.field) {
    case 'service':
      fieldValue = (resource.resource_type || resource.service || '').toLowerCase();
      break;
    case 'cloud_provider':
      fieldValue = (resource.cloud_provider || 'AWS').toLowerCase();
      break;
    case 'account_id':
      fieldValue = (resource.aws_account_id || resource.account_id || '').toLowerCase();
      break;
    case 'resource_name':
      fieldValue = (resource.resource_name || '').toLowerCase();
      break;
    case 'cost_gt':
    case 'cost_lt':
      fieldValue = Number(resource.total_cost || 0);
      break;
    default:
      return false;
  }

  const condValue = condition.value.toLowerCase();

  switch (condition.operator) {
    case 'equals':
      return String(fieldValue) === condValue;
    case 'contains':
      return String(fieldValue).includes(condValue);
    case 'starts_with':
      return String(fieldValue).startsWith(condValue);
    case 'ends_with':
      return String(fieldValue).endsWith(condValue);
    case 'regex':
      try { return new RegExp(condition.value, 'i').test(String(fieldValue)); } catch { return false; }
    case 'gt':
      return Number(fieldValue) > Number(condition.value);
    case 'lt':
      return Number(fieldValue) < Number(condition.value);
    default:
      return false;
  }
}

function resourceMatchesAllConditions(resource: any, conditions: RuleCondition[]): boolean {
  return conditions.every(c => matchesCondition(resource, c));
}

export async function executeAutoRules(organizationId: string, userId: string) {
  const prisma = getPrismaClient();

  // Get active rules
  const rules = await (prisma as any).tagAutoRule.findMany({
    where: { organization_id: organizationId, is_active: true },
  });

  if (rules.length === 0) return { rulesProcessed: 0, totalMatched: 0, totalApplied: 0, results: [] };

  // Get all resources from daily_costs
  const resources: any[] = await prisma.$queryRaw`
    SELECT 
      service || '::' || COALESCE(aws_account_id::text, COALESCE(azure_credential_id::text, 'unknown')) as resource_id,
      service as resource_type,
      service as resource_name,
      COALESCE(cloud_provider, 'AWS') as cloud_provider,
      COALESCE(aws_account_id::text, azure_credential_id::text) as account_id,
      SUM(cost) as total_cost
    FROM daily_costs
    WHERE organization_id = ${organizationId}::uuid
    GROUP BY service, cloud_provider, aws_account_id, azure_credential_id
  `;

  // Get all existing assignments to avoid duplicates
  const existingAssignments = await prisma.resourceTagAssignment.findMany({
    where: { organization_id: organizationId },
    select: { tag_id: true, resource_id: true },
  });
  const existingSet = new Set(existingAssignments.map((a: any) => `${a.tag_id}::${a.resource_id}`));

  const results: any[] = [];
  let totalMatched = 0;
  let totalApplied = 0;

  for (const rule of rules) {
    const conditions = rule.conditions as RuleCondition[];
    const tagIds = rule.tag_ids as string[];
    let matched = 0;
    let applied = 0;
    const createData: any[] = [];

    for (const resource of resources) {
      if (resourceMatchesAllConditions(resource, conditions)) {
        matched++;
        for (const tagId of tagIds) {
          const key = `${tagId}::${resource.resource_id}`;
          if (!existingSet.has(key)) {
            createData.push({
              organization_id: organizationId,
              tag_id: tagId,
              resource_id: resource.resource_id,
              resource_type: resource.resource_type || 'unknown',
              resource_name: resource.resource_name || null,
              cloud_provider: resource.cloud_provider || 'AWS',
              aws_account_id: resource.account_id || null,
              assigned_by: userId,
            });
            existingSet.add(key); // prevent duplicates within same run
          }
        }
      }
    }

    // Batch insert
    if (createData.length > 0) {
      try {
        const created = await prisma.resourceTagAssignment.createMany({
          data: createData,
          skipDuplicates: true,
        });
        applied = created.count;
      } catch (err: any) {
        logger.error('Auto-rule batch insert error', { ruleId: rule.id, error: err.message });
      }
    }

    // Update rule stats
    await (prisma as any).tagAutoRule.update({
      where: { id: rule.id },
      data: {
        last_run_at: new Date(),
        last_run_matched: matched,
        last_run_applied: applied,
        total_applied: { increment: applied },
      },
    });

    totalMatched += matched;
    totalApplied += applied;
    results.push({ ruleId: rule.id, ruleName: rule.name, matched, applied });

    // Invalidate cache for affected tags
    for (const tagId of tagIds) {
      if (applied > 0) await invalidateOnAssignmentChange(organizationId, tagId);
    }
  }

  return { rulesProcessed: rules.length, totalMatched, totalApplied, results };
}
