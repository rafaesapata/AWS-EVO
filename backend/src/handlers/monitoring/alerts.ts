/**
 * Lambda handler for Alerts CRUD
 * Gerencia alertas (listar, reconhecer, resolver)
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { isOrganizationInDemoMode, generateDemoAlerts } from '../../lib/demo-data-service.js';
import { alertsQuerySchema, alertUpdateSchema, alertDeleteSchema } from '../../lib/schemas.js';
import { parseAndValidateBody, validateQueryParams } from '../../lib/validation.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Alerts handler started');
  
  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';
  let method = getHttpMethod(event);
  
  if (method === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();
    
    // Support method override via body for HTTP API (which only supports POST)
    if (method === 'POST' && event.body) {
      try {
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        if (body._method) {
          method = body._method.toUpperCase();
        } else if (body.action && (body.action === 'acknowledge' || body.action === 'resolve')) {
          // If action is provided, treat as PUT
          method = 'PUT';
        }
      } catch {
        // Ignore parse errors, continue with original method
      }
    }
    
    // ========================================
    // DEMO MODE CHECK - FAIL-SAFE (only for GET)
    // ========================================
    if (method === 'GET') {
      const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
      if (isDemo === true) {
        logger.info('Returning demo alerts data', { organizationId, isDemo: true });
        const demoAlerts = generateDemoAlerts();
        return success(demoAlerts, 200, origin);
      }
    }
    // ========================================
    
    // GET - Listar alertas
    if (method === 'GET') {
      // Validate query parameters
      const queryValidation = validateQueryParams(alertsQuerySchema, event.queryStringParameters);
      if (!queryValidation.success) {
        return queryValidation.error;
      }
      const { severity, status, limit } = queryValidation.data;
      
      const alerts = await prisma.alert.findMany({
        where: {
          organization_id: organizationId,
          ...(severity && { severity }),
          ...(status === 'active' && { acknowledged_at: null, resolved_at: null }),
          ...(status === 'acknowledged' && { acknowledged_at: { not: null }, resolved_at: null }),
          ...(status === 'resolved' && { resolved_at: { not: null } }),
        },
        orderBy: { triggered_at: 'desc' },
        take: limit,
        include: {
          rule: true,
        },
      });
      
      return success(alerts, 200, origin);
    }
    
    // PUT - Atualizar alerta (acknowledge/resolve)
    if (method === 'PUT') {
      const validation = parseAndValidateBody(alertUpdateSchema, event.body);
      if (!validation.success) {
        return validation.error;
      }
      const { id, action } = validation.data;
      
      // Verificar se alerta pertence à organização
      const existing = await prisma.alert.findFirst({
        where: { id, organization_id: organizationId },
      });
      
      if (!existing) {
        return error('Alerta não encontrado', 404, undefined, origin);
      }
      
      const updateData: any = {};
      if (action === 'acknowledge') {
        updateData.acknowledged_at = new Date();
      } else if (action === 'resolve') {
        updateData.resolved_at = new Date();
        if (!existing.acknowledged_at) {
          updateData.acknowledged_at = new Date();
        }
      }
      
      const alert = await prisma.alert.update({
        where: { id },
        data: updateData,
      });
      
      logger.info(`✅ Alert ${action}d: ${alert.id}`);
      
      return success(alert, 200, origin);
    }
    
    // DELETE - Deletar alerta
    if (method === 'DELETE') {
      // Try to get ID from body or query params
      let alertId: string | undefined;
      
      if (event.body) {
        const validation = parseAndValidateBody(alertDeleteSchema, event.body);
        if (!validation.success) {
          return validation.error;
        }
        alertId = validation.data.id;
      } else {
        alertId = event.queryStringParameters?.id;
      }
      
      if (!alertId) {
        return badRequest('ID do alerta é obrigatório');
      }
      
      // Verificar se alerta pertence à organização
      const existing = await prisma.alert.findFirst({
        where: { id: alertId, organization_id: organizationId },
      });
      
      if (!existing) {
        return error('Alerta não encontrado', 404, undefined, origin);
      }
      
      await prisma.alert.delete({
        where: { id: alertId },
      });
      
      logger.info(`✅ Alert deleted: ${alertId}`);
      
      return success({ success: true, message: 'Alerta deletado com sucesso' }, 200, origin);
    }
    
    return error('Método não suportado', 405, undefined, origin);
    
  } catch (err) {
    logger.error('❌ Alerts error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
  }
}
