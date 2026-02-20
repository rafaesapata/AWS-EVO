/**
 * Tag Suggestions Handler — Smart Resource Tagging
 * GET /api/v1/tags/suggestions
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { getSuggestions } from '../../lib/tags/tag-service.js';

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

    if (!qs.resource_type || !qs.resource_name) {
      return error('resource_type and resource_name are required', 422, undefined, origin);
    }

    const result = await getSuggestions(
      organizationId,
      qs.resource_type,
      qs.resource_name,
      qs.account_id || '',
      qs.region || ''
    );

    return success(result.data, 200, origin);
  } catch (err: any) {
    logger.error('tag-suggestions handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
