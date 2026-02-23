/**
 * Tag CRUD Handler — Smart Resource Tagging
 * POST /api/functions/tag-crud
 * Melhoria 9: Dispatch map pattern instead of 20+ if/else
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, forbidden, notFound } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation, hasRole } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent, type AuditAction, type AuditResourceType } from '../../lib/audit-service.js';
import { createTag, listTags, getTagDetails, updateTag, deleteTag } from '../../lib/tags/tag-service.js';
import { getTagPolicies, saveTagPolicies } from '../../lib/tags/tag-policy-service.js';
import { setTagParent, getTagTree, getDescendants, mergeTags, renameTag } from '../../lib/tags/tag-hierarchy-service.js';
import { listAutoRules, createAutoRule, updateAutoRule, deleteAutoRule, executeAutoRules } from '../../lib/tags/tag-auto-rules-service.js';
import { getTagCostDrilldown, getTagCostSparkline } from '../../lib/tags/tag-cost-drilldown-service.js';
import { isOrganizationInDemoMode } from '../../lib/demo-data-service.js';
import { getPrismaClient } from '../../lib/database.js';

// Demo tags — must match frontend src/lib/demo/tag-demo-data.ts DEMO_TAGS
const DEMO_TAGS = [
  { id: 'demo-tag-001', key: 'environment', value: 'production', color: '#EF4444', category: 'ENVIRONMENT', description: 'Production workloads', usage_count: 142, created_at: '2025-11-15T10:00:00Z' },
  { id: 'demo-tag-002', key: 'environment', value: 'staging', color: '#F59E0B', category: 'ENVIRONMENT', description: 'Staging environment', usage_count: 87, created_at: '2025-11-15T10:05:00Z' },
  { id: 'demo-tag-003', key: 'environment', value: 'development', color: '#3B82F6', category: 'ENVIRONMENT', description: 'Development environment', usage_count: 63, created_at: '2025-11-15T10:10:00Z' },
  { id: 'demo-tag-004', key: 'cost-center', value: 'engineering', color: '#8B5CF6', category: 'COST_CENTER', description: 'Engineering department', usage_count: 198, created_at: '2025-11-20T08:00:00Z' },
  { id: 'demo-tag-005', key: 'cost-center', value: 'marketing', color: '#EC4899', category: 'COST_CENTER', description: 'Marketing department', usage_count: 45, created_at: '2025-11-20T08:05:00Z' },
  { id: 'demo-tag-006', key: 'cost-center', value: 'data-science', color: '#14B8A6', category: 'COST_CENTER', description: 'Data Science team', usage_count: 34, created_at: '2025-11-20T08:10:00Z' },
  { id: 'demo-tag-007', key: 'team', value: 'platform', color: '#06B6D4', category: 'TEAM', description: 'Platform team', usage_count: 112, created_at: '2025-12-01T09:00:00Z' },
  { id: 'demo-tag-008', key: 'team', value: 'backend', color: '#10B981', category: 'TEAM', description: 'Backend team', usage_count: 89, created_at: '2025-12-01T09:05:00Z' },
  { id: 'demo-tag-009', key: 'team', value: 'frontend', color: '#F97316', category: 'TEAM', description: 'Frontend team', usage_count: 56, created_at: '2025-12-01T09:10:00Z' },
  { id: 'demo-tag-010', key: 'project', value: 'evo-platform', color: '#6366F1', category: 'PROJECT', description: 'EVO Platform project', usage_count: 234, created_at: '2025-12-05T14:00:00Z' },
  { id: 'demo-tag-011', key: 'project', value: 'data-pipeline', color: '#0EA5E9', category: 'PROJECT', description: 'Data Pipeline project', usage_count: 67, created_at: '2025-12-05T14:05:00Z' },
  { id: 'demo-tag-012', key: 'compliance', value: 'pci-dss', color: '#DC2626', category: 'COMPLIANCE', description: 'PCI DSS compliant resources', usage_count: 28, created_at: '2025-12-10T11:00:00Z' },
  { id: 'demo-tag-013', key: 'compliance', value: 'hipaa', color: '#B91C1C', category: 'COMPLIANCE', description: 'HIPAA compliant resources', usage_count: 15, created_at: '2025-12-10T11:05:00Z' },
  { id: 'demo-tag-014', key: 'criticality', value: 'high', color: '#EF4444', category: 'CRITICALITY', description: 'High criticality resources', usage_count: 76, created_at: '2025-12-12T16:00:00Z' },
  { id: 'demo-tag-015', key: 'criticality', value: 'medium', color: '#F59E0B', category: 'CRITICALITY', description: 'Medium criticality', usage_count: 124, created_at: '2025-12-12T16:05:00Z' },
  { id: 'demo-tag-016', key: 'criticality', value: 'low', color: '#22C55E', category: 'CRITICALITY', description: 'Low criticality', usage_count: 89, created_at: '2025-12-12T16:10:00Z' },
  { id: 'demo-tag-017', key: 'backup', value: 'daily', color: '#7C3AED', category: 'CUSTOM', description: 'Daily backup policy', usage_count: 52, created_at: '2025-12-15T13:00:00Z' },
  { id: 'demo-tag-018', key: 'auto-shutdown', value: 'enabled', color: '#059669', category: 'CUSTOM', description: 'Auto-shutdown enabled', usage_count: 31, created_at: '2025-12-15T13:05:00Z' },
];

function getOrigin(event: AuthorizedEvent): string {
  return event.headers?.['origin'] || event.headers?.['Origin'] || '*';
}

type ActionContext = {
  organizationId: string;
  userId: string;
  user: any;
  body: any;
  event: AuthorizedEvent;
  origin: string;
};

function requireAdmin(ctx: ActionContext, origin: string, permission: string): APIGatewayProxyResultV2 | null {
  if (!hasRole(ctx.user, 'admin') && !hasRole(ctx.user, 'org_admin') && !hasRole(ctx.user, 'super_admin')) {
    return forbidden(`Required permission: ${permission}`, origin);
  }
  return null;
}

function requireUserOrAdmin(ctx: ActionContext, origin: string, permission: string): APIGatewayProxyResultV2 | null {
  if (!hasRole(ctx.user, 'admin') && !hasRole(ctx.user, 'org_admin') && !hasRole(ctx.user, 'super_admin') && !hasRole(ctx.user, 'user')) {
    return forbidden(`Required permission: ${permission}`, origin);
  }
  return null;
}

function audit(ctx: ActionContext, action: AuditAction, resourceType: AuditResourceType, resourceId: string, details: any) {
  logAuditAsync({
    organizationId: ctx.organizationId, userId: ctx.userId, action,
    resourceType, resourceId, details,
    ipAddress: getIpFromEvent(ctx.event), userAgent: getUserAgentFromEvent(ctx.event),
  });
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

const actions: Record<string, (ctx: ActionContext) => Promise<APIGatewayProxyResultV2>> = {
  async list(ctx) {
    // Demo mode: return hardcoded demo tags (no DB queries)
    const prisma = getPrismaClient();
    const isDemo = await isOrganizationInDemoMode(prisma, ctx.organizationId);
    if (isDemo) {
      let filtered = [...DEMO_TAGS];
      if (ctx.body.category) filtered = filtered.filter(t => t.category === ctx.body.category);
      if (ctx.body.search) {
        const s = ctx.body.search.toLowerCase();
        filtered = filtered.filter(t =>
          t.key.toLowerCase().includes(s) || t.value.toLowerCase().includes(s)
        );
      }
      return success({ tags: filtered, total: filtered.length, nextCursor: null, _isDemo: true }, 200, ctx.origin);
    }

    const result = await listTags({
      organizationId: ctx.organizationId,
      category: ctx.body.category, key: ctx.body.key, search: ctx.body.search,
      sortBy: ctx.body.sortBy, limit: ctx.body.limit, cursor: ctx.body.cursor,
    });
    return success(result, 200, ctx.origin);
  },

  async get(ctx) {
    if (!ctx.body.tagId) return error('tagId is required', 400, undefined, ctx.origin);
    const result = await getTagDetails(ctx.organizationId, ctx.body.tagId);
    if ('error' in result) return notFound(result.message, ctx.origin);
    return success(result.data, 200, ctx.origin);
  },

  async create(ctx) {
    const denied = requireUserOrAdmin(ctx, ctx.origin, 'tags:create');
    if (denied) return denied;
    const result = await createTag(ctx.organizationId, ctx.userId, ctx.body);
    if ('error' in result) return error(String(result.message || result.error), result.statusCode || 400, result.errors, ctx.origin);
    audit(ctx, 'TAG_CREATED', 'tag', result.data.id, { key: result.data.key, value: result.data.value });
    return success(result.data, 201, ctx.origin);
  },

  async update(ctx) {
    if (!ctx.body.tagId) return error('tagId is required', 400, undefined, ctx.origin);
    const denied = requireUserOrAdmin(ctx, ctx.origin, 'tags:update');
    if (denied) return denied;
    const { tagId, action: _a, ...updateData } = ctx.body;
    const result = await updateTag(ctx.organizationId, tagId, ctx.userId, updateData);
    if ('error' in result) {
      if (result.statusCode === 404) return notFound(String(result.message || 'Not found'), ctx.origin);
      return error(String(result.message || result.error), result.statusCode || 400, result.errors, ctx.origin);
    }
    audit(ctx, 'TAG_UPDATED', 'tag', tagId, { changedFields: updateData, oldValues: result.oldValues });
    return success(result.data, 200, ctx.origin);
  },

  async delete(ctx) {
    if (!ctx.body.tagId) return error('tagId is required', 400, undefined, ctx.origin);
    const denied = requireAdmin(ctx, ctx.origin, 'tags:delete');
    if (denied) return denied;
    const result = await deleteTag(ctx.organizationId, ctx.body.tagId);
    if ('error' in result) return notFound(result.message, ctx.origin);
    audit(ctx, 'TAG_DELETED', 'tag', ctx.body.tagId, { key: result.data.key, value: result.data.value, assignmentsRemoved: result.data.assignmentsRemoved });
    return success(result.data, 200, ctx.origin);
  },

  async 'get-policies'(ctx) {
    const policies = await getTagPolicies(ctx.organizationId);
    return success(policies, 200, ctx.origin);
  },

  async 'save-policies'(ctx) {
    const denied = requireAdmin(ctx, ctx.origin, 'tags:manage_policies');
    if (denied) return denied;
    const policies = await saveTagPolicies(ctx.organizationId, ctx.userId, ctx.body);
    audit(ctx, 'TAG_POLICIES_UPDATED', 'tag_policy', ctx.organizationId, { policies });
    return success(policies, 200, ctx.origin);
  },

  async 'set-parent'(ctx) {
    const result = await setTagParent(ctx.organizationId, ctx.body.tagId, ctx.body.parentId || null);
    return success(result, 200, ctx.origin);
  },

  async 'get-tree'(ctx) {
    const tree = await getTagTree(ctx.organizationId);
    return success(tree, 200, ctx.origin);
  },

  async 'get-descendants'(ctx) {
    if (!ctx.body.tagId) return error('tagId is required', 400, undefined, ctx.origin);
    const ids = await getDescendants(ctx.organizationId, ctx.body.tagId);
    return success({ tagIds: ids }, 200, ctx.origin);
  },

  async merge(ctx) {
    const denied = requireAdmin(ctx, ctx.origin, 'tags:merge');
    if (denied) return denied;
    if (!ctx.body.sourceTagIds || !ctx.body.targetTagId) return error('sourceTagIds and targetTagId are required', 400, undefined, ctx.origin);
    const result = await mergeTags(ctx.organizationId, ctx.userId, ctx.body.sourceTagIds, ctx.body.targetTagId);
    audit(ctx, 'TAG_MERGED', 'tag', ctx.body.targetTagId, { sourceTagIds: ctx.body.sourceTagIds, ...result });
    return success(result, 200, ctx.origin);
  },

  async rename(ctx) {
    if (!ctx.body.tagId || !ctx.body.newKey || !ctx.body.newValue) return error('tagId, newKey, newValue are required', 400, undefined, ctx.origin);
    const result = await renameTag(ctx.organizationId, ctx.body.tagId, ctx.body.newKey, ctx.body.newValue);
    audit(ctx, 'TAG_RENAMED', 'tag', ctx.body.tagId, result);
    return success(result, 200, ctx.origin);
  },

  async 'list-auto-rules'(ctx) {
    const rules = await listAutoRules(ctx.organizationId);
    return success(rules, 200, ctx.origin);
  },

  async 'create-auto-rule'(ctx) {
    const denied = requireAdmin(ctx, ctx.origin, 'tags:manage_rules');
    if (denied) return denied;
    const rule = await createAutoRule(ctx.organizationId, ctx.userId, ctx.body);
    audit(ctx, 'TAG_AUTO_RULE_CREATED', 'tag_auto_rule', rule.id, { name: rule.name });
    return success(rule, 201, ctx.origin);
  },

  async 'update-auto-rule'(ctx) {
    if (!ctx.body.ruleId) return error('ruleId is required', 400, undefined, ctx.origin);
    const rule = await updateAutoRule(ctx.organizationId, ctx.body.ruleId, ctx.body);
    return success(rule, 200, ctx.origin);
  },

  async 'delete-auto-rule'(ctx) {
    if (!ctx.body.ruleId) return error('ruleId is required', 400, undefined, ctx.origin);
    await deleteAutoRule(ctx.organizationId, ctx.body.ruleId);
    return success({ deleted: true }, 200, ctx.origin);
  },

  async 'execute-auto-rules'(ctx) {
    const denied = requireAdmin(ctx, ctx.origin, 'tags:execute_rules');
    if (denied) return denied;
    const result = await executeAutoRules(ctx.organizationId, ctx.userId);
    audit(ctx, 'TAG_AUTO_RULES_EXECUTED', 'tag_auto_rule', ctx.organizationId, result);
    return success(result, 200, ctx.origin);
  },

  async 'cost-drilldown'(ctx) {
    if (!ctx.body.tagId) return error('tagId is required', 400, undefined, ctx.origin);
    const result = await getTagCostDrilldown(ctx.organizationId, {
      tagId: ctx.body.tagId, startDate: ctx.body.startDate,
      endDate: ctx.body.endDate, groupBy: ctx.body.groupBy,
    });
    return success(result, 200, ctx.origin);
  },

  async 'cost-sparkline'(ctx) {
    if (!ctx.body.tagId) return error('tagId is required', 400, undefined, ctx.origin);
    const result = await getTagCostSparkline(ctx.organizationId, ctx.body.tagId);
    return success(result, 200, ctx.origin);
  },
};

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const method = event.requestContext?.http?.method || event.httpMethod || '';

  if (method === 'OPTIONS') return corsOptions(origin);

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user) as string;
    const userId = user.sub as string;
    const body = JSON.parse(event.body || '{}');
    const action = body.action;

    if (!action) return error('action is required', 400, undefined, origin);

    const actionHandler = actions[action];
    if (!actionHandler) return error('Invalid action', 400, undefined, origin);

    return await actionHandler({ organizationId, userId, user, body, event, origin });
  } catch (err: any) {
    logger.error('tag-crud handler error', err);
    return error(String(err.message || 'Internal server error'), 500, undefined, origin);
  }
}
