/**
 * Tag Resources Handler — Smart Resource Tagging
 * GET /api/v1/resources/:id/tags, GET /api/v1/tags/:id/resources
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { getTagsForResource, getResourcesByTag } from '../../lib/tags/tag-assignment-service.js';

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
  if (method !== 'GET') return error('Method not allowed', 405, undefined, origin);

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const path = event.rawPath || event.path || '';
    const qs = event.queryStringParameters || {};

    // GET /api/v1/resources/:id/tags
    if (path.includes('/resources/') && path.endsWith('/tags')) {
      const parts = path.split('/').filter(Boolean);
      const resourceId = decodeURIComponent(parts[3]);
      const tags = await getTagsForResource(organizationId, resourceId);
      return success(tags, 200, origin);
    }

    // GET /api/v1/tags/:id/resources
    if (path.includes('/tags/') && path.endsWith('/resources')) {
      const parts = path.split('/').filter(Boolean);
      const tagId = parts[3];
      const result = await getResourcesByTag(organizationId, tagId, {
        limit: qs.limit ? parseInt(qs.limit) : undefined,
        cursor: qs.cursor,
        resourceType: qs.resource_type,
        cloudProvider: qs.cloud_provider,
      });
      return success(result, 200, origin);
    }

    return error('Invalid path', 400, undefined, origin);
  } catch (err: any) {
    logger.error('tag-resources handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
