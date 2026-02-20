/**
 * Tag Cost Report Handler — Smart Resource Tagging
 * POST /api/functions/tag-cost-report
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

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const body = JSON.parse(event.body || '{}');

    if (!body.tagId) return error('tagId is required', 400, undefined, origin);

    // Default to last 30 days if no dates provided
    const endDate = body.endDate || new Date().toISOString().split('T')[0];
    const startDate = body.startDate || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().split('T')[0];
    })();

    const result = await getCostReport(organizationId, body.tagId, {
      startDate,
      endDate,
      cloudProvider: body.cloudProvider,
      accountId: body.accountId,
    });

    return success(result.data, 200, origin);
  } catch (err: any) {
    logger.error('tag-cost-report handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
