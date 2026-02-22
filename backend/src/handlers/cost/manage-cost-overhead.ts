/**
 * Manage Cost Overhead Handler
 * 
 * action: 'get' - Returns the current overhead percentage for an organization
 * action: 'update' - Updates the overhead percentage (super_admin only)
 * 
 * Overhead is applied transparently to all cost responses.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, isSuperAdmin } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { invalidateOverheadCache } from '../../lib/cost-overhead.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { z } from 'zod';

const updateOverheadSchema = z.object({
  organizationId: z.string().uuid(),
  overhead_percentage: z.number()
    .min(0, 'Overhead deve ser >= 0.00')
    .max(100, 'Overhead deve ser <= 100.00')
    .multipleOf(0.01, 'Overhead deve ter no máximo 2 casas decimais'),
});

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') return corsOptions();

  try {
    const user = getUserFromEvent(event);

    // RBAC: super_admin only
    if (!isSuperAdmin(user)) {
      return error('Forbidden: super_admin role required', 403);
    }

    const prisma = getPrismaClient();
    const body = event.body ? JSON.parse(event.body) : {};
    const action = body.action || 'get';

    // ========== GET ==========
    if (action === 'get') {
      const organizationId = body.organizationId;
      if (!organizationId) return error('organizationId is required', 400);

      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { cost_overhead_percentage: true },
      });

      if (!org) return error('Organization not found', 404);

      return success({
        cost_overhead_percentage: Number(org.cost_overhead_percentage),
      });
    }

    // ========== UPDATE ==========
    if (action !== 'update') {
      return error('Invalid action. Use "get" or "update"', 400);
    }

    const parseResult = updateOverheadSchema.safeParse(body);

    if (!parseResult.success) {
      const messages = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return error(`Validation error: ${messages}`, 400);
    }

    const { organizationId, overhead_percentage } = parseResult.data;

    // Fetch current value for audit log
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { cost_overhead_percentage: true },
    });

    if (!org) return error('Organization not found', 404);

    const previousValue = Number(org.cost_overhead_percentage);
    const isNew = previousValue === 0 && overhead_percentage > 0;

    // Update
    await prisma.organization.update({
      where: { id: organizationId },
      data: { cost_overhead_percentage: overhead_percentage },
    });

    // Invalidate caches
    await invalidateOverheadCache(organizationId);

    // Audit log
    logAuditAsync({
      organizationId,
      userId: user.sub,
      action: isNew ? 'OVERHEAD_CREATED' : 'OVERHEAD_UPDATED',
      resourceType: 'organization_overhead',
      resourceId: organizationId,
      details: {
        previous_value: previousValue,
        new_value: overhead_percentage,
      },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event),
    });

    logger.info('Cost overhead updated', {
      organizationId,
      previousValue,
      newValue: overhead_percentage,
      userId: user.sub,
    });

    return success({
      cost_overhead_percentage: overhead_percentage,
      previous_value: previousValue,
    });
  } catch (err) {
    logger.error('Manage cost overhead error', err as Error, { requestId: context.awsRequestId });
    return error('An unexpected error occurred', 500);
  }
}
