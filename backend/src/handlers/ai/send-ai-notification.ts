/**
 * Send AI Notification Handler (Admin Only)
 * Permite super admins enviarem notificações proativas para organizações/usuários
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

const sendNotificationSchema = z.object({
  // Target
  target_organization_id: z.string().uuid().optional(), // Se não informado, usa a org do usuário
  target_user_id: z.string().uuid().optional(), // Se não informado, envia para toda a org
  
  // Notification content
  type: z.string().default('custom'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  suggested_action: z.string().max(500).optional(),
  action_type: z.string().optional(), // 'security_scan', 'compliance_scan', 'navigate', etc.
  action_params: z.record(z.unknown()).optional(),
  context: z.record(z.unknown()).optional(),
  
  // Expiration
  expires_in_hours: z.number().min(1).max(720).default(168), // Default 7 days
});

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
    const userOrganizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    // Verificar se é super_admin
    const userRoles = user['custom:roles'] ? JSON.parse(user['custom:roles']) : [];
    const isSuperAdmin = userRoles.includes('super_admin');

    // Validate request body with Zod
    const validation = parseAndValidateBody(sendNotificationSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }

    const data = validation.data;

    // Determinar organização alvo
    let targetOrgId = data.target_organization_id || userOrganizationId;

    // Se não é super_admin, só pode enviar para sua própria organização
    if (!isSuperAdmin && targetOrgId !== userOrganizationId) {
      return error('You can only send notifications to your own organization', 403);
    }

    // Verificar se a organização existe
    const targetOrg = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { id: true, name: true },
    });

    if (!targetOrg) {
      return error('Target organization not found', 404);
    }

    // Se target_user_id foi informado, verificar se pertence à organização
    if (data.target_user_id) {
      const userProfile = await prisma.profile.findFirst({
        where: {
          user_id: data.target_user_id,
          organization_id: targetOrgId,
        },
      });

      if (!userProfile) {
        return error('Target user not found in the organization', 404);
      }
    }

    logger.info('Creating AI notification', {
      targetOrgId,
      targetUserId: data.target_user_id,
      type: data.type,
      priority: data.priority,
      createdBy: user.sub,
    });

    // Criar notificação
    const notificationType = data.type || 'custom';
    const expiresInHours = data.expires_in_hours || 168;
    
    const notification = await prisma.aiNotification.create({
      data: {
        organization_id: targetOrgId,
        user_id: data.target_user_id || null,
        type: notificationType,
        priority: data.priority,
        title: data.title,
        message: data.message,
        suggested_action: data.suggested_action ?? null,
        action_type: data.action_type ?? null,
        action_params: data.action_params as object | undefined,
        context: data.context as object | undefined,
        status: 'pending',
        expires_at: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
        created_by: user.sub,
      },
    });

    // Audit log
    logAuditAsync({
      organizationId: targetOrgId,
      userId: user.sub,
      action: 'AI_NOTIFICATION_SENT',
      resourceType: 'ai_notification',
      resourceId: notification.id,
      details: {
        type: data.type,
        priority: data.priority,
        target_user_id: data.target_user_id,
        title: data.title,
      },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event),
    });

    logger.info('AI notification created', { notificationId: notification.id });

    return success({
      success: true,
      notification: {
        id: notification.id,
        organization_id: notification.organization_id,
        user_id: notification.user_id,
        type: notification.type,
        priority: notification.priority,
        title: notification.title,
        status: notification.status,
        expires_at: notification.expires_at,
        created_at: notification.created_at,
      },
    });

  } catch (err) {
    logger.error('Error sending AI notification', err as Error);
    return error('Failed to send notification');
  }
}
