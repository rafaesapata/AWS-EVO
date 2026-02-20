/**
 * Tag Inventory Report Handler — Smart Resource Tagging
 * GET /api/v1/tags/:id/inventory
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { getInventoryReport } from '../../lib/tags/report-service.js';

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
    const parts = path.split('/').filter(Boolean);
    const tagId = parts[3];
    const qs = event.queryStringParameters || {};

    const result = await getInventoryReport(organizationId, tagId, {
      resourceType: qs.resource_type,
      cloudProvider: qs.cloud_provider,
    });

    return success(result.data, 200, origin);
  } catch (err: any) {
    logger.error('tag-inventory-report handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
