/**
 * Tag Inventory Report Handler — Smart Resource Tagging
 * POST /api/functions/tag-inventory-report
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

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const body = JSON.parse(event.body || '{}');

    if (!body.tagId) return error('tagId is required', 400, undefined, origin);

    const result = await getInventoryReport(organizationId, body.tagId, {
      resourceType: body.resourceType,
      cloudProvider: body.cloudProvider,
    });

    return success(result.data, 200, origin);
  } catch (err: any) {
    logger.error('tag-inventory-report handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
