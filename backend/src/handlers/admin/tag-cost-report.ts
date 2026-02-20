/**
 * Tag Cost Report Handler — Smart Resource Tagging
 * GET /api/v1/tags/:id/cost-report
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { getCostReport } from '../../lib/tags/report-service.js';

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

    if (!qs.start_date || !qs.end_date) {
      return error('start_date and end_date are required', 422, undefined, origin);
    }

    const result = await getCostReport(organizationId, tagId, {
      startDate: qs.start_date,
      endDate: qs.end_date,
      cloudProvider: qs.cloud_provider,
      accountId: qs.account_id,
    });

    return success(result.data, 200, origin);
  } catch (err: any) {
    logger.error('tag-cost-report handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
