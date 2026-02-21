/**
 * Tag Suggestions Handler — Smart Resource Tagging
 * POST /api/functions/tag-suggestions
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

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const body = JSON.parse(event.body || '{}');

    if (!body.resourceType) {
      return error('resourceType is required', 422, undefined, origin);
    }

    const result = await getSuggestions(
      organizationId,
      body.resourceType,
      body.resourceName || '',
      body.accountId || '',
      body.region || ''
    );

    return success(result.data, 200, origin);
  } catch (err: any) {
    logger.error('tag-suggestions handler error', { message: err?.message, stack: err?.stack });
    return error(err?.message || 'Internal server error', 500, undefined, origin);
  }
}
