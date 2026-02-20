/**
 * Tag Security Findings Handler — Smart Resource Tagging
 * GET /api/v1/tags/security-findings
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
  if (method !== 'GET') return error('Method not allowed', 405, undefined, origin);

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const qs = event.queryStringParameters || {};

    const tagIds = qs.tag_ids ? qs.tag_ids.split(',') : [];
    if (tagIds.length === 0) {
      return error('tag_ids query parameter is required', 422, undefined, origin);
    }

    const result = await getSecurityFindings(organizationId, tagIds, {
      limit: qs.limit ? parseInt(qs.limit) : undefined,
      cursor: qs.cursor,
      severity: qs.severity,
      status: qs.status,
      cloudProvider: qs.cloud_provider,
    });

    return success(result, 200, origin);
  } catch (err: any) {
    logger.error('tag-security-findings handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
