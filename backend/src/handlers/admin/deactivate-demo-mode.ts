/**
 * Deactivate Demo Mode Handler
 * 
 * Permite que o próprio usuário da organização desative o modo demo.
 * Isso "ativa" a conta real, removendo as restrições de demonstração.
 * 
 * DIFERENTE de manage-demo-mode.ts:
 * - Este endpoint permite que QUALQUER usuário da organização desative o demo
 * - Não requer super_admin
 * - Apenas desativa (não pode ativar ou estender)
 * 
 * SEGURANÇA:
 * - Usuário só pode desativar demo da própria organização
 * - Ação é auditada
 * - Requer confirmação explícita
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

// Schema de validação
const deactivateDemoSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm the deactivation by setting confirm: true' })
  })
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

    // Parse and validate body using centralized validation
    const validation = parseAndValidateBody(deactivateDemoSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    logger.info('Parsed request body', { body: validation.data });

    logger.info('Deactivate demo mode request', { 
      organizationId, 
      userId: user.sub 
    });

    // Buscar organização
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
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

    // Verificar se está em modo demo
    if (!organization.demo_mode) {
      return success({
        message: 'Organization is not in demo mode',
        demo_mode: false,
        already_active: true
      });
    }

    const previousState = {
      demo_mode: organization.demo_mode,
      demo_activated_at: organization.demo_activated_at,
      demo_expires_at: organization.demo_expires_at
    };

    // Desativar modo demo
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        demo_mode: false,
        demo_expires_at: null
        // Manter demo_activated_at e demo_activated_by para histórico
      }
    });

    // Registrar auditoria na tabela específica de demo mode
    try {
      await prisma.demoModeAudit.create({
        data: {
          organization_id: organizationId,
          action: 'SELF_DEACTIVATED',
          performed_by: user.sub,
          previous_state: previousState,
          new_state: { demo_mode: false },
          reason: 'User self-activated real account',
          ip_address: getIpFromEvent(event),
          user_agent: getUserAgentFromEvent(event)
        }
      });
    } catch (auditError) {
      // Log error but don't fail the operation
      logger.warn('Failed to create demo mode audit record', { error: auditError });
    }

    logger.info('Demo mode self-deactivated', { 
      organizationId, 
      organizationName: organization.name,
      deactivatedBy: user.sub 
    });

    // Audit log geral
    logAuditAsync({
      organizationId,
      userId: user.sub,
      action: 'SETTINGS_UPDATE',
      resourceType: 'organization',
      resourceId: organizationId,
      details: { 
        setting: 'demo_mode', 
        value: false,
        action: 'self_deactivated',
        previousState
      },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event)
    });

    return success({
      message: 'Account activated successfully! Demo mode has been deactivated.',
      demo_mode: false,
      organization_name: organization.name
    });

  } catch (err) {
    logger.error('Error deactivating demo mode', err as Error);
    return error('Internal server error');
  }
}
