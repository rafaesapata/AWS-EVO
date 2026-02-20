/**
 * Tag Security Findings Handler — Smart Resource Tagging
 * POST /api/functions/tag-security-findings
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { getSecurityFindings } from '../../lib/tags/report-service.js';

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

    const tagIds = body.tagIds || [];
    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      return error('tagIds array is required', 422, undefined, origin);
    }

    const result = await getSecurityFindings(organizationId, tagIds, {
      limit: body.limit,
      cursor: body.cursor,
      severity: body.severity,
      status: body.status,
      cloudProvider: body.cloudProvider,
    });

    return success(result, 200, origin);
  } catch (err: any) {
    logger.error('tag-security-findings handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
