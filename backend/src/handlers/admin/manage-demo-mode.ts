/**
 * Manage Demo Mode Handler
 * 
 * Endpoint para administradores gerenciarem o modo de demonstração das organizações.
 * 
 * AÇÕES:
 * - activate: Ativa o modo demo para uma organização
 * - deactivate: Desativa o modo demo
 * - extend: Estende a data de expiração
 * - status: Retorna o status atual do demo mode
 * 
 * SEGURANÇA:
 * - Apenas super_admin pode ativar/desativar demo mode
 * - Todas as ações são auditadas
 * - Demo mode expira automaticamente após período configurado
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation, isSuperAdmin } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { z } from 'zod';

// Schema de validação
const manageDemoModeSchema = z.object({
  action: z.enum(['activate', 'deactivate', 'extend', 'status']),
  organizationId: z.string().uuid().optional(), // Para super_admin gerenciar outras orgs
  expiresInDays: z.number().min(1).max(90).optional().default(30),
  reason: z.string().max(500).optional()
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
    const userOrgId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    // Parse body
    let body: any = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch {
        return error('Invalid JSON body', 400);
      }
    }

    // Validar input
    const validation = manageDemoModeSchema.safeParse(body);
    if (!validation.success) {
      return error(`Validation error: ${validation.error.message}`, 400);
    }

    const { action, organizationId, expiresInDays, reason } = validation.data;

    // Determinar qual organização gerenciar
    // Super admin pode gerenciar qualquer org, outros apenas a própria
    const targetOrgId = organizationId || userOrgId;

    // Verificar se usuário é super_admin usando a função correta
    const userIsSuperAdmin = isSuperAdmin(user);
    
    logger.info('Demo mode request', { 
      action, 
      targetOrgId, 
      userOrgId, 
      userIsSuperAdmin,
      userId: user.sub 
    });

    if (organizationId && organizationId !== userOrgId && !userIsSuperAdmin) {
      return error('Only super_admin can manage other organizations', 403);
    }

    // Buscar organização
    const organization = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: {
        id: true,
        name: true,
        demo_mode: true,
        demo_activated_at: true,
        demo_expires_at: true,
        demo_activated_by: true
      }
    });

    if (!organization) {
      return error('Organization not found', 404);
    }

    // Executar ação
    switch (action) {
      case 'status': {
        return success({
          organizationId: organization.id,
          organizationName: organization.name,
          demo_mode: organization.demo_mode,
          demo_activated_at: organization.demo_activated_at,
          demo_expires_at: organization.demo_expires_at,
          demo_activated_by: organization.demo_activated_by,
          isExpired: organization.demo_expires_at 
            ? new Date(organization.demo_expires_at) < new Date() 
            : false
        });
      }

      case 'activate': {
        if (!userIsSuperAdmin) {
          return error('Only super_admin can activate demo mode', 403);
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);

        const previousState = {
          demo_mode: organization.demo_mode,
          demo_activated_at: organization.demo_activated_at,
          demo_expires_at: organization.demo_expires_at
        };

        // Atualizar organização
        await prisma.organization.update({
          where: { id: targetOrgId },
          data: {
            demo_mode: true,
            demo_activated_at: new Date(),
            demo_expires_at: expiresAt,
            demo_activated_by: user.sub
          }
        });

        // Registrar auditoria
        await prisma.demoModeAudit.create({
          data: {
            organization_id: targetOrgId,
            action: 'ACTIVATED',
            performed_by: user.sub,
            previous_state: previousState,
            new_state: {
              demo_mode: true,
              demo_activated_at: new Date(),
              demo_expires_at: expiresAt
            },
            reason,
            ip_address: getIpFromEvent(event),
            user_agent: getUserAgentFromEvent(event)
          }
        });

        logger.info('Demo mode activated', { 
          organizationId: targetOrgId, 
          expiresAt,
          activatedBy: user.sub 
        });

        // Audit log geral
        logAuditAsync({
          organizationId: targetOrgId,
          userId: user.sub,
          action: 'SETTINGS_UPDATE',
          resourceType: 'organization',
          resourceId: targetOrgId,
          details: { 
            setting: 'demo_mode', 
            value: true,
            expiresAt: expiresAt.toISOString()
          },
          ipAddress: getIpFromEvent(event),
          userAgent: getUserAgentFromEvent(event)
        });

        return success({
          message: 'Demo mode activated successfully',
          demo_mode: true,
          demo_activated_at: new Date().toISOString(),
          demo_expires_at: expiresAt.toISOString()
        });
      }

      case 'deactivate': {
        if (!userIsSuperAdmin) {
          return error('Only super_admin can deactivate demo mode', 403);
        }

        const previousState = {
          demo_mode: organization.demo_mode,
          demo_activated_at: organization.demo_activated_at,
          demo_expires_at: organization.demo_expires_at
        };

        // Atualizar organização
        await prisma.organization.update({
          where: { id: targetOrgId },
          data: {
            demo_mode: false,
            demo_expires_at: null
            // Manter demo_activated_at e demo_activated_by para histórico
          }
        });

        // Registrar auditoria
        await prisma.demoModeAudit.create({
          data: {
            organization_id: targetOrgId,
            action: 'DEACTIVATED',
            performed_by: user.sub,
            previous_state: previousState,
            new_state: { demo_mode: false },
            reason,
            ip_address: getIpFromEvent(event),
            user_agent: getUserAgentFromEvent(event)
          }
        });

        logger.info('Demo mode deactivated', { 
          organizationId: targetOrgId, 
          deactivatedBy: user.sub 
        });

        logAuditAsync({
          organizationId: targetOrgId,
          userId: user.sub,
          action: 'SETTINGS_UPDATE',
          resourceType: 'organization',
          resourceId: targetOrgId,
          details: { setting: 'demo_mode', value: false },
          ipAddress: getIpFromEvent(event),
          userAgent: getUserAgentFromEvent(event)
        });

        return success({
          message: 'Demo mode deactivated successfully',
          demo_mode: false
        });
      }

      case 'extend': {
        if (!userIsSuperAdmin) {
          return error('Only super_admin can extend demo mode', 403);
        }

        if (!organization.demo_mode) {
          return error('Demo mode is not active', 400);
        }

        const currentExpiry = organization.demo_expires_at 
          ? new Date(organization.demo_expires_at) 
          : new Date();
        
        const newExpiry = new Date(Math.max(currentExpiry.getTime(), Date.now()));
        newExpiry.setDate(newExpiry.getDate() + expiresInDays);

        const previousState = {
          demo_expires_at: organization.demo_expires_at
        };

        // Atualizar organização
        await prisma.organization.update({
          where: { id: targetOrgId },
          data: {
            demo_expires_at: newExpiry
          }
        });

        // Registrar auditoria
        await prisma.demoModeAudit.create({
          data: {
            organization_id: targetOrgId,
            action: 'EXTENDED',
            performed_by: user.sub,
            previous_state: previousState,
            new_state: { demo_expires_at: newExpiry },
            reason,
            ip_address: getIpFromEvent(event),
            user_agent: getUserAgentFromEvent(event)
          }
        });

        logger.info('Demo mode extended', { 
          organizationId: targetOrgId, 
          newExpiry,
          extendedBy: user.sub 
        });

        return success({
          message: 'Demo mode extended successfully',
          demo_expires_at: newExpiry.toISOString()
        });
      }

      default:
        return error('Invalid action', 400);
    }

  } catch (err) {
    logger.error('Error managing demo mode', err as Error);
    return error('Internal server error');
  }
}
