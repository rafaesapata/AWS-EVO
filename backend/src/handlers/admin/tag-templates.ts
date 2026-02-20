/**
 * Tag Templates Handler — Smart Resource Tagging
 * POST /api/functions/tag-templates
 * Actions: list, apply
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { getTemplates, applyTemplates } from '../../lib/tags/tag-service.js';

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
    const action = body.action || 'list';

    if (action === 'list') {
      const result = getTemplates();
      return success(result.data, 200, origin);
    }

    if (action === 'apply') {
      const templateIds = body.templateIds || body.template_ids || [];
      if (!Array.isArray(templateIds) || templateIds.length === 0) {
        return error('templateIds array is required', 422, undefined, origin);
      }
      const result = await applyTemplates(organizationId, user.sub, templateIds);
      logAuditAsync({
        organizationId, userId: user.sub, action: 'TAG_CREATED',
        resourceType: 'tag',
        details: { templateIds, createdCount: result.data.createdCount, skippedCount: result.data.skippedCount },
        ipAddress: getIpFromEvent(event), userAgent: getUserAgentFromEvent(event),
      });
      return success(result.data, 200, origin);
    }

    return error('Invalid action', 400, undefined, origin);
  } catch (err: any) {
    logger.error('tag-templates handler error', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
