/**
 * Get AI Notifications Handler
 * Busca notificações proativas da IA para o usuário atual
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    logger.info('Fetching AI notifications', { organizationId, userId: user.sub });

    // Buscar notificações ativas para este usuário ou para toda a org
    // Inclui 'read' para que notificações já lidas ainda apareçam no chat
    const notifications = await prisma.aiNotification.findMany({
      where: {
        organization_id: organizationId,
        OR: [
          { user_id: user.sub },
          { user_id: null }, // Notificações para toda a org
        ],
        status: { in: ['pending', 'delivered', 'read'] },
        AND: [
          {
            OR: [
              { expires_at: null },
              { expires_at: { gt: new Date() } },
            ],
          },
        ],
      },
      orderBy: [
        { priority: 'desc' }, // critical > high > medium > low
        { created_at: 'desc' },
      ],
      take: 20,
    });

    // Marcar como delivered se ainda estavam pending
    const pendingIds = notifications
      .filter(n => n.status === 'pending')
      .map(n => n.id);

    if (pendingIds.length > 0) {
      await prisma.aiNotification.updateMany({
        where: { id: { in: pendingIds } },
        data: {
          status: 'delivered',
          delivered_at: new Date(),
        },
      });
    }

    // Contar notificações não lidas (pending ou delivered, NÃO read/actioned/dismissed)
    const unreadCount = notifications.filter(n => 
      n.status === 'pending' || n.status === 'delivered'
    ).length;

    logger.info('AI notifications fetched', {
      total: notifications.length,
      pending: pendingIds.length,
      unread: unreadCount,
    });

    return success({
      notifications: notifications.map(n => ({
        id: n.id,
        type: n.type,
        priority: n.priority,
        title: n.title,
        message: n.message,
        suggested_action: n.suggested_action,
        action_type: n.action_type,
        action_params: n.action_params,
        context: n.context,
        status: n.status,
        created_at: n.created_at,
      })),
      unread_count: unreadCount,
    });

  } catch (err) {
    logger.error('Error fetching AI notifications', err as Error);
    return error('Failed to fetch notifications');
  }
}
