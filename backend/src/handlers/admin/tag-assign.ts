/**
 * Tag Assign/Unassign Handler — Smart Resource Tagging
 * POST /api/v1/tags/:id/assign, POST /api/v1/tags/:id/unassign
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, forbidden } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation, hasRole } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { assignTag, unassignTag } from '../../lib/tags/tag-assignment-service.js';

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
    const organizationId = getOrganizationIdWithImpersonation(event, user);

    if (!hasRole(user, 'admin') && !hasRole(user, 'org_admin') && !hasRole(user, 'super_admin') && !hasRole(user, 'user')) {
      return forbidden('Required permission: tags:assign', origin);
    }

    const path = event.rawPath || event.path || '';
    const pathParts = path.split('/').filter(Boolean);
    // /api/v1/tags/:id/assign or /api/v1/tags/:id/unassign
    const tagId = pathParts[3];
    const action = pathParts[4]; // 'assign' or 'unassign'

    const body = JSON.parse(event.body || '{}');

    if (action === 'assign') {
      const resources = body.resources || [];
      if (!Array.isArray(resources) || resources.length === 0 || resources.length > 100) {
        return error('Resources array must have 1-100 items', 422, undefined, origin);
      }

      const result = await assignTag(organizationId, user.sub, tagId, resources);

      logAuditAsync({
        organizationId, userId: user.sub, action: 'TAG_ASSIGNED',
        resourceType: 'tag', resourceId: tagId,
        details: { assignedCount: result.assignedCount, skippedCount: result.skippedCount, failedCount: result.failedCount },
        ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
      });

      return success(result, 200, origin);
    }

    if (action === 'unassign') {
      const resourceIds = body.resource_ids || [];
      if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
        return error('resource_ids array is required', 422, undefined, origin);
      }

      const result = await unassignTag(organizationId, tagId, resourceIds);

      logAuditAsync({
        organizationId, userId: user.sub, action: 'TAG_REMOVED',
        resourceType: 'tag', resourceId: tagId,
        details: { removedCount: result.removedCount, notFoundCount: result.notFoundCount },
        ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
      });

      return success(result, 200, origin);
    }

    return error('Invalid action', 400, undefined, origin);
  } catch (err: any) {
    logger.error('tag-assign handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
