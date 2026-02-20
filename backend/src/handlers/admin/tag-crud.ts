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

    return error('Invalid action', 400, undefined, origin);
  } catch (err: any) {
    logger.error('tag-crud handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
