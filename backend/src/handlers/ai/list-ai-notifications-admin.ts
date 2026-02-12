/**
 * List AI Notifications Admin Handler
 * Lista todas as notificações para administração (super admin)
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

const querySchema = z.object({
  organization_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'delivered', 'read', 'actioned', 'dismissed', 'all']).optional(),
  type: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const userOrganizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    // Verificar se é super_admin
    const userRoles = user['custom:roles'] ? JSON.parse(user['custom:roles']) : [];
    const isSuperAdmin = userRoles.includes('super_admin');

    // Parse and validate body using centralized validation
    const validation = parseAndValidateBody(querySchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const params = validation.data;

    // Se não é super_admin, só pode ver notificações da própria organização
    const targetOrgId = isSuperAdmin ? params.organization_id : userOrganizationId;

    logger.info('Listing AI notifications (admin)', {
      targetOrgId,
      status: params.status,
      isSuperAdmin,
    });

    // Build where clause
    const where: Record<string, unknown> = {};

    if (targetOrgId) {
      where.organization_id = targetOrgId;
    }

    if (params.status && params.status !== 'all') {
      where.status = params.status;
    }

    if (params.type) {
      where.type = params.type;
    }

    if (params.priority) {
      where.priority = params.priority;
    }

    // Buscar notificações
    const [notifications, total] = await Promise.all([
      prisma.aiNotification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: params.limit,
        skip: params.offset,
      }),
      prisma.aiNotification.count({ where }),
    ]);

    // Se super_admin, buscar info das organizações
    let orgMap: Record<string, string> = {};
    if (isSuperAdmin && notifications.length > 0) {
      const orgIds = [...new Set(notifications.map(n => n.organization_id))];
      const orgs = await prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true },
      });
      orgMap = Object.fromEntries(orgs.map(o => [o.id, o.name]));
    }

    // Estatísticas
    const stats = await prisma.aiNotification.groupBy({
      by: ['status'],
      where: targetOrgId ? { organization_id: targetOrgId } : {},
      _count: { status: true },
    });

    const statusCounts = Object.fromEntries(
      stats.map(s => [s.status, s._count.status])
    );

    return success({
      notifications: notifications.map(n => ({
        id: n.id,
        organization_id: n.organization_id,
        organization_name: orgMap[n.organization_id] || null,
        user_id: n.user_id,
        type: n.type,
        priority: n.priority,
        title: n.title,
        message: n.message,
        suggested_action: n.suggested_action,
        action_type: n.action_type,
        action_params: n.action_params,
        context: n.context,
        status: n.status,
        delivered_at: n.delivered_at,
        read_at: n.read_at,
        actioned_at: n.actioned_at,
        dismissed_at: n.dismissed_at,
        expires_at: n.expires_at,
        created_by: n.created_by,
        created_at: n.created_at,
      })),
      pagination: {
        total,
        limit: params.limit,
        offset: params.offset,
        has_more: (params.offset ?? 0) + notifications.length < total,
      },
      stats: {
        pending: statusCounts.pending || 0,
        delivered: statusCounts.delivered || 0,
        read: statusCounts.read || 0,
        actioned: statusCounts.actioned || 0,
        dismissed: statusCounts.dismissed || 0,
      },
    });

  } catch (err) {
    logger.error('Error listing AI notifications (admin)', err as Error);
    return error('Failed to list notifications');
  }
}
