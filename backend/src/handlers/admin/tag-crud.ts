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
