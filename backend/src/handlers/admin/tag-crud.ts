/**
 * Tag CRUD Handler — Smart Resource Tagging
 * POST/GET/PATCH/DELETE /api/v1/tags
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
    const path = event.rawPath || event.path || '';
    const pathParts = path.split('/').filter(Boolean);
    // /api/v1/tags/:id → pathParts = ['api', 'v1', 'tags', ':id']
    const tagId = pathParts.length >= 4 ? pathParts[3] : null;

    // ---- POST: Create Tag ----
    if (method === 'POST' && !tagId) {
      if (!hasRole(user, 'admin') && !hasRole(user, 'org_admin') && !hasRole(user, 'super_admin') && !hasRole(user, 'user')) {
        return forbidden('Required permission: tags:create', origin);
      }

      const body = JSON.parse(event.body || '{}');
      const result = await createTag(organizationId, userId, body);

      if ('error' in result) {
        return error(String(result.message || result.error), result.statusCode || 400, result.errors, origin);
      }

      logAuditAsync({
        organizationId, userId: userId, action: 'TAG_CREATED',
        resourceType: 'tag', resourceId: result.data.id,
        details: { key: result.data.key, value: result.data.value },
        ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
      });

      return success(result.data, 201, origin);
    }

    // ---- GET: List Tags ----
    if (method === 'GET' && !tagId) {
      const qs = event.queryStringParameters || {};
      const result = await listTags({
        organizationId,
        category: qs.category,
        key: qs.key,
        search: qs.search,
        sortBy: qs.sort_by as any,
        limit: qs.limit ? parseInt(qs.limit) : undefined,
        cursor: qs.cursor,
      });

      return success(result, 200, origin);
    }

    // ---- GET: Tag Details ----
    if (method === 'GET' && tagId) {
      const result = await getTagDetails(organizationId, tagId);
      if ('error' in result) return notFound(result.message, origin);
      return success(result.data, 200, origin);
    }

    // ---- PATCH: Update Tag ----
    if (method === 'PATCH' && tagId) {
      if (!hasRole(user, 'admin') && !hasRole(user, 'org_admin') && !hasRole(user, 'super_admin') && !hasRole(user, 'user')) {
        return forbidden('Required permission: tags:update', origin);
      }

      const body = JSON.parse(event.body || '{}');
      const result = await updateTag(organizationId, tagId, userId, body);

      if ('error' in result) {
        if (result.statusCode === 404) return notFound(String(result.message || 'Not found'), origin);
        return error(String(result.message || result.error), result.statusCode || 400, result.errors, origin);
      }

      logAuditAsync({
        organizationId, userId: userId, action: 'TAG_UPDATED',
        resourceType: 'tag', resourceId: tagId,
        details: { changedFields: body, oldValues: result.oldValues },
        ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
      });

      return success(result.data, 200, origin);
    }

    // ---- DELETE: Delete Tag ----
    if (method === 'DELETE' && tagId) {
      if (!hasRole(user, 'admin') && !hasRole(user, 'org_admin') && !hasRole(user, 'super_admin')) {
        return forbidden('Required permission: tags:delete', origin);
      }

      const result = await deleteTag(organizationId, tagId);
      if ('error' in result) return notFound(result.message, origin);

      logAuditAsync({
        organizationId, userId: userId, action: 'TAG_DELETED',
        resourceType: 'tag', resourceId: tagId,
        details: { key: result.data.key, value: result.data.value, assignmentsRemoved: result.data.assignmentsRemoved },
        ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
      });

      return success(result.data, 200, origin);
    }

    return error('Method not allowed', 405, undefined, origin);
  } catch (err: any) {
    logger.error('tag-crud handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
