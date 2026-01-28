/**
 * Update AI Notification Handler
 * Atualiza o status de uma notificação (read, actioned, dismissed)
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { z } from 'zod';

const updateSchema = z.object({
  notification_id: z.string().uuid(),
  action: z.enum(['read', 'actioned', 'dismissed']),
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
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    const body = JSON.parse(event.body || '{}');
    const validation = updateSchema.safeParse(body);

    if (!validation.success) {
      return error('Invalid request: ' + validation.error.message, 400);
    }

    const { notification_id, action } = validation.data;

    logger.info('Updating AI notification', { notificationId: notification_id, action });

    // Verificar se a notificação pertence à organização
    const notification = await prisma.aiNotification.findFirst({
      where: {
        id: notification_id,
        organization_id: organizationId,
      },
    });

    if (!notification) {
      return error('Notification not found', 404);
    }

    // Atualizar status
    const updateData: Record<string, unknown> = {
      status: action,
      updated_at: new Date(),
    };

    switch (action) {
      case 'read':
        updateData.read_at = new Date();
        break;
      case 'actioned':
        updateData.actioned_at = new Date();
        break;
      case 'dismissed':
        updateData.dismissed_at = new Date();
        break;
    }

    await prisma.aiNotification.update({
      where: { id: notification_id },
      data: updateData,
    });

    logger.info('AI notification updated', { notificationId: notification_id, action });

    return success({ success: true });

  } catch (err) {
    logger.error('Error updating AI notification', err as Error);
    return error('Failed to update notification');
  }
}
