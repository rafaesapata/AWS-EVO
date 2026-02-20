/**
 * Untagged Resources Handler — Smart Resource Tagging
 * POST /api/functions/tag-untagged-resources
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

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const body = JSON.parse(event.body || '{}');

    const result = await getUntaggedResources(organizationId, {
      limit: body.limit,
      cursor: body.cursor,
      resourceType: body.resourceType,
      cloudProvider: body.cloudProvider,
      region: body.region,
      accountId: body.accountId,
    });

    return success(result, 200, origin);
  } catch (err: any) {
    logger.error('tag-untagged-resources handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
