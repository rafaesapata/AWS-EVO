/**
 * Tag Bulk Assign Handler — Smart Resource Tagging
 * POST /api/functions/tag-bulk-assign
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, forbidden } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation, hasRole } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { bulkAssign } from '../../lib/tags/tag-assignment-service.js';
import { MAX_BULK_RESOURCES } from '../../lib/tags/tag-validation.js';

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
      return forbidden('Required permission: tags:bulk_assign', origin);
    }

    const body = JSON.parse(event.body || '{}');
    const tagIds = body.tagIds || body.tag_ids || [];
    const resourceIds = body.resourceIds || body.resource_ids || [];
    const resources = body.resources || []; // New format: array of { resourceId, resourceType, ... }

    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      return error('tagIds array is required', 422, undefined, origin);
    }

    // Accept both formats: resources[] (with metadata) or resourceIds[] (legacy)
    const resolvedResources = resources.length > 0 ? resources : resourceIds;
    if (!Array.isArray(resolvedResources) || resolvedResources.length === 0) {
      return error('resources or resourceIds array is required', 422, undefined, origin);
    }
    const totalCount = resolvedResources.length;
    if (totalCount > MAX_BULK_RESOURCES) {
      return error(`Maximum ${MAX_BULK_RESOURCES} resources per bulk operation`, 422, undefined, origin);
    }

    const result = await bulkAssign(organizationId, user.sub, tagIds, resolvedResources);

    logAuditAsync({
      organizationId, userId: user.sub, action: 'TAG_BULK_ASSIGNED',
      resourceType: 'tag',
      details: { tagIds, totalProcessed: result.totalProcessed, assignedCount: result.assignedCount, failedCount: result.failedCount },
      ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
    });

    return success(result, 200, origin);
  } catch (err: any) {
    logger.error('tag-bulk-assign handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
