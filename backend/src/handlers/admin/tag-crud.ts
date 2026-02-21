/**
 * Tag CRUD Handler — Smart Resource Tagging
 * POST /api/functions/tag-crud
 * Actions: list, get, create, update, delete
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, forbidden, notFound } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation, hasRole } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { createTag, listTags, getTagDetails, updateTag, deleteTag } from '../../lib/tags/tag-service.js';
import { getTagPolicies, saveTagPolicies } from '../../lib/tags/tag-policy-service.js';
import { setTagParent, getTagTree, getDescendants, mergeTags, renameTag } from '../../lib/tags/tag-hierarchy-service.js';
import { listAutoRules, createAutoRule, updateAutoRule, deleteAutoRule, executeAutoRules } from '../../lib/tags/tag-auto-rules-service.js';
import { getTagCostDrilldown, getTagCostSparkline } from '../../lib/tags/tag-cost-drilldown-service.js';

function getOrigin(event: AuthorizedEvent): string {
  return event.headers?.['origin'] || event.headers?.['Origin'] || '*';
}

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

    // ---- list ----
    if (action === 'list') {
      const result = await listTags({
        organizationId,
        category: body.category,
        key: body.key,
        search: body.search,
        sortBy: body.sortBy,
        limit: body.limit,
        cursor: body.cursor,
      });
      return success(result, 200, origin);
    }

    // ---- get ----
    if (action === 'get') {
      if (!body.tagId) return error('tagId is required', 400, undefined, origin);
      const result = await getTagDetails(organizationId, body.tagId);
      if ('error' in result) return notFound(result.message, origin);
      return success(result.data, 200, origin);
    }

    // ---- create ----
    if (action === 'create') {
      if (!hasRole(user, 'admin') && !hasRole(user, 'org_admin') && !hasRole(user, 'super_admin') && !hasRole(user, 'user')) {
        return forbidden('Required permission: tags:create', origin);
      }
      const result = await createTag(organizationId, userId, body);
      if ('error' in result) {
        return error(String(result.message || result.error), result.statusCode || 400, result.errors, origin);
      }
      logAuditAsync({
        organizationId, userId, action: 'TAG_CREATED',
        resourceType: 'tag', resourceId: result.data.id,
        details: { key: result.data.key, value: result.data.value },
        ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
      });
      return success(result.data, 201, origin);
    }

    // ---- update ----
    if (action === 'update') {
      if (!body.tagId) return error('tagId is required', 400, undefined, origin);
      if (!hasRole(user, 'admin') && !hasRole(user, 'org_admin') && !hasRole(user, 'super_admin') && !hasRole(user, 'user')) {
        return forbidden('Required permission: tags:update', origin);
      }
      const { tagId, action: _a, ...updateData } = body;
      const result = await updateTag(organizationId, tagId, userId, updateData);
      if ('error' in result) {
        if (result.statusCode === 404) return notFound(String(result.message || 'Not found'), origin);
        return error(String(result.message || result.error), result.statusCode || 400, result.errors, origin);
      }
      logAuditAsync({
        organizationId, userId, action: 'TAG_UPDATED',
        resourceType: 'tag', resourceId: tagId,
        details: { changedFields: updateData, oldValues: result.oldValues },
        ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
      });
      return success(result.data, 200, origin);
    }

    // ---- delete ----
    if (action === 'delete') {
      if (!body.tagId) return error('tagId is required', 400, undefined, origin);
      if (!hasRole(user, 'admin') && !hasRole(user, 'org_admin') && !hasRole(user, 'super_admin')) {
        return forbidden('Required permission: tags:delete', origin);
      }
      const result = await deleteTag(organizationId, body.tagId);
      if ('error' in result) return notFound(result.message, origin);
      logAuditAsync({
        organizationId, userId, action: 'TAG_DELETED',
        resourceType: 'tag', resourceId: body.tagId,
        details: { key: result.data.key, value: result.data.value, assignmentsRemoved: result.data.assignmentsRemoved },
        ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
      });
      return success(result.data, 200, origin);
    }

    // ---- get-policies ----
    if (action === 'get-policies') {
      const policies = await getTagPolicies(organizationId);
      return success(policies, 200, origin);
    }

    // ---- save-policies ----
    if (action === 'save-policies') {
      if (!hasRole(user, 'admin') && !hasRole(user, 'org_admin') && !hasRole(user, 'super_admin')) {
        return forbidden('Required permission: tags:manage_policies', origin);
      }
      const policies = await saveTagPolicies(organizationId, userId, body);
      logAuditAsync({
        organizationId, userId, action: 'TAG_POLICIES_UPDATED',
        resourceType: 'tag_policy', resourceId: organizationId,
        details: { policies },
        ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
      });
      return success(policies, 200, origin);
    }

    // ---- set-parent (hierarchy) ----
    if (action === 'set-parent') {
      const result = await setTagParent(organizationId, body.tagId, body.parentId || null);
      return success(result, 200, origin);
    }

    // ---- get-tree (hierarchy) ----
    if (action === 'get-tree') {
      const tree = await getTagTree(organizationId);
      return success(tree, 200, origin);
    }

    // ---- get-descendants (hierarchy) ----
    if (action === 'get-descendants') {
      if (!body.tagId) return error('tagId is required', 400, undefined, origin);
      const ids = await getDescendants(organizationId, body.tagId);
      return success({ tagIds: ids }, 200, origin);
    }

    // ---- merge ----
    if (action === 'merge') {
      if (!hasRole(user, 'admin') && !hasRole(user, 'org_admin') && !hasRole(user, 'super_admin')) {
        return forbidden('Required permission: tags:merge', origin);
      }
      if (!body.sourceTagIds || !body.targetTagId) return error('sourceTagIds and targetTagId are required', 400, undefined, origin);
      const result = await mergeTags(organizationId, userId, body.sourceTagIds, body.targetTagId);
      logAuditAsync({
        organizationId, userId, action: 'TAG_MERGED',
        resourceType: 'tag', resourceId: body.targetTagId,
        details: { sourceTagIds: body.sourceTagIds, ...result },
        ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
      });
      return success(result, 200, origin);
    }

    // ---- rename ----
    if (action === 'rename') {
      if (!body.tagId || !body.newKey || !body.newValue) return error('tagId, newKey, newValue are required', 400, undefined, origin);
      const result = await renameTag(organizationId, body.tagId, body.newKey, body.newValue);
      logAuditAsync({
        organizationId, userId, action: 'TAG_RENAMED',
        resourceType: 'tag', resourceId: body.tagId,
        details: result,
        ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
      });
      return success(result, 200, origin);
    }

    // ---- auto-rules CRUD ----
    if (action === 'list-auto-rules') {
      const rules = await listAutoRules(organizationId);
      return success(rules, 200, origin);
    }

    if (action === 'create-auto-rule') {
      if (!hasRole(user, 'admin') && !hasRole(user, 'org_admin') && !hasRole(user, 'super_admin')) {
        return forbidden('Required permission: tags:manage_rules', origin);
      }
      const rule = await createAutoRule(organizationId, userId, body);
      logAuditAsync({
        organizationId, userId, action: 'TAG_AUTO_RULE_CREATED',
        resourceType: 'tag_auto_rule', resourceId: rule.id,
        details: { name: rule.name },
        ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
      });
      return success(rule, 201, origin);
    }

    if (action === 'update-auto-rule') {
      if (!body.ruleId) return error('ruleId is required', 400, undefined, origin);
      const rule = await updateAutoRule(organizationId, body.ruleId, body);
      return success(rule, 200, origin);
    }

    if (action === 'delete-auto-rule') {
      if (!body.ruleId) return error('ruleId is required', 400, undefined, origin);
      await deleteAutoRule(organizationId, body.ruleId);
      return success({ deleted: true }, 200, origin);
    }

    if (action === 'execute-auto-rules') {
      if (!hasRole(user, 'admin') && !hasRole(user, 'org_admin') && !hasRole(user, 'super_admin')) {
        return forbidden('Required permission: tags:execute_rules', origin);
      }
      const result = await executeAutoRules(organizationId, userId);
      logAuditAsync({
        organizationId, userId, action: 'TAG_AUTO_RULES_EXECUTED',
        resourceType: 'tag_auto_rule', resourceId: organizationId,
        details: result,
        ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
      });
      return success(result, 200, origin);
    }

    // ---- cost drill-down ----
    if (action === 'cost-drilldown') {
      if (!body.tagId) return error('tagId is required', 400, undefined, origin);
      const result = await getTagCostDrilldown(organizationId, {
        tagId: body.tagId,
        startDate: body.startDate,
        endDate: body.endDate,
        groupBy: body.groupBy,
      });
      return success(result, 200, origin);
    }

    if (action === 'cost-sparkline') {
      if (!body.tagId) return error('tagId is required', 400, undefined, origin);
      const result = await getTagCostSparkline(organizationId, body.tagId);
      return success(result, 200, origin);
    }

    return error('Invalid action', 400, undefined, origin);
  } catch (err: any) {
    logger.error('tag-crud handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
