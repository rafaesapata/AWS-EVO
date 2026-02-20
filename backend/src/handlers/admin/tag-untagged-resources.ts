/**
 * Untagged Resources Handler — Smart Resource Tagging
 * GET /api/v1/resources/untagged
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { getUntaggedResources } from '../../lib/tags/tag-assignment-service.js';

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
    const qs = event.queryStringParameters || {};

    const result = await getUntaggedResources(organizationId, {
      limit: qs.limit ? parseInt(qs.limit) : undefined,
      cursor: qs.cursor,
      resourceType: qs.resource_type,
      cloudProvider: qs.cloud_provider,
      region: qs.region,
      accountId: qs.account_id,
    });

    return success(result, 200, origin);
  } catch (err: any) {
    logger.error('tag-untagged-resources handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
