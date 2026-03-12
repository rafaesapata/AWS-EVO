/**
 * Get Health Events Summary - Resumo agregado de eventos do AWS Health
 * POST /api/functions/get-health-events-summary
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
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

    const orgFilter = { organization_id: organizationId };

    const [severityGroups, openEvents, totalTicketsCreated, credentialExposures, total] = await Promise.all([
      prisma.awsHealthEvent.groupBy({
        by: ['severity'],
        where: orgFilter,
        _count: true,
      }),
      prisma.awsHealthEvent.count({
        where: { ...orgFilter, status_code: 'open' },
      }),
      prisma.awsHealthEvent.count({
        where: { ...orgFilter, remediation_ticket_id: { not: null } },
      }),
      prisma.awsHealthEvent.count({
        where: { ...orgFilter, is_credential_exposure: true },
      }),
      prisma.awsHealthEvent.count({ where: orgFilter }),
    ]);

    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const group of severityGroups) {
      const key = group.severity as keyof typeof bySeverity;
      if (key in bySeverity) {
        bySeverity[key] = group._count;
      }
    }

    return success({ bySeverity, openEvents, totalTicketsCreated, credentialExposures, total }, 200, origin);
  } catch (err) {
    logger.error('❌ Get health events summary error:', err);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}
