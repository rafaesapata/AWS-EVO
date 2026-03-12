/**
 * Get Health Event Details - Detalhes de um evento específico do AWS Health
 * POST /api/functions/get-health-event-details
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    const prisma = getPrismaClient();

    let body: any = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return badRequest('Invalid JSON body', undefined, origin);
    }

    if (!body.id || typeof body.id !== 'string') {
      return badRequest('id is required and must be a string', undefined, origin);
    }

    const healthEvent = await prisma.awsHealthEvent.findFirst({
      where: { id: body.id, organization_id: organizationId },
    });

    if (!healthEvent) {
      return error('Health event not found', 404, undefined, origin);
    }

    let ticket = null;
    if (healthEvent.remediation_ticket_id) {
      ticket = await prisma.remediationTicket.findFirst({
        where: { id: healthEvent.remediation_ticket_id, organization_id: organizationId },
      });
    }

    return success({ event: healthEvent, ticket }, 200, origin);
  } catch (err) {
    logger.error('❌ Get health event details error:', err);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}
