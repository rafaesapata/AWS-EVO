/**
 * Get Health Events - Lista eventos do AWS Health com paginação e filtros
 * POST /api/functions/get-health-events
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

    const limit = Math.min(Math.max(body.limit ?? 20, 1), 100);
    const offset = Math.max(body.offset ?? 0, 0);

    if (body.limit !== undefined && (typeof body.limit !== 'number' || body.limit <= 0 || body.limit > 100)) {
      return badRequest('limit must be a number between 1 and 100', undefined, origin);
    }
    if (body.offset !== undefined && (typeof body.offset !== 'number' || body.offset < 0)) {
      return badRequest('offset must be a non-negative number', undefined, origin);
    }

    const where: any = { organization_id: organizationId };

    if (body.severity) where.severity = body.severity;
    if (body.status_code) where.status_code = body.status_code;
    if (body.aws_account_id) where.aws_account_id = body.aws_account_id;
    if (typeof body.is_credential_exposure === 'boolean') {
      where.is_credential_exposure = body.is_credential_exposure;
    }

    const [events, total] = await Promise.all([
      prisma.awsHealthEvent.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.awsHealthEvent.count({ where }),
    ]);

    return success({ events, total, limit, offset }, 200, origin);
  } catch (err) {
    logger.error('❌ Get health events error:', err);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}
