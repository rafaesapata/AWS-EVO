/**
 * Lambda handler for Alerts CRUD
 * Gerencia alertas (listar, reconhecer, resolver)
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { isOrganizationInDemoMode, generateDemoAlerts } from '../../lib/demo-data-service.js';

interface UpdateAlertRequest {
  id: string;
  action: 'acknowledge' | 'resolve';
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Alerts handler started');
  
  const method = getHttpMethod(event);
  
  if (method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();
    
    // ========================================
    // DEMO MODE CHECK - FAIL-SAFE (only for GET)
    // ========================================
    if (method === 'GET') {
      const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
      if (isDemo === true) {
        logger.info('Returning demo alerts data', { organizationId, isDemo: true });
        const demoAlerts = generateDemoAlerts();
        return success(demoAlerts);
      }
    }
    // ========================================
    
    // GET - Listar alertas
    if (method === 'GET') {
      const queryParams = event.queryStringParameters || {};
      const severity = queryParams.severity;
      const status = queryParams.status; // 'active', 'acknowledged', 'resolved'
      const limit = parseInt(queryParams.limit || '50');
      
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
      
      return success(alerts);
    }
    
    // PUT - Atualizar alerta (acknowledge/resolve)
    if (method === 'PUT') {
      const body: UpdateAlertRequest = event.body ? JSON.parse(event.body) : {};
      
      if (!body.id || !body.action) {
        return error('ID e ação são obrigatórios', 400);
      }
      
      // Verificar se alerta pertence à organização
      const existing = await prisma.alert.findFirst({
        where: { id: body.id, organization_id: organizationId },
      });
      
      if (!existing) {
        return error('Alerta não encontrado', 404);
      }
      
      const updateData: any = {};
      if (body.action === 'acknowledge') {
        updateData.acknowledged_at = new Date();
      } else if (body.action === 'resolve') {
        updateData.resolved_at = new Date();
        if (!existing.acknowledged_at) {
          updateData.acknowledged_at = new Date();
        }
      }
      
      const alert = await prisma.alert.update({
        where: { id: body.id },
        data: updateData,
      });
      
      logger.info(`✅ Alert ${body.action}d: ${alert.id}`);
      
      return success(alert);
    }
    
    // DELETE - Deletar alerta
    if (method === 'DELETE') {
      const body = event.body ? JSON.parse(event.body) : {};
      const alertId = body.id || event.queryStringParameters?.id;
      
      if (!alertId) {
        return error('ID do alerta é obrigatório', 400);
      }
      
      // Verificar se alerta pertence à organização
      const existing = await prisma.alert.findFirst({
        where: { id: alertId, organization_id: organizationId },
      });
      
      if (!existing) {
        return error('Alerta não encontrado', 404);
      }
      
      await prisma.alert.delete({
        where: { id: alertId },
      });
      
      logger.info(`✅ Alert deleted: ${alertId}`);
      
      return success({ success: true, message: 'Alerta deletado com sucesso' });
    }
    
    return error('Método não suportado', 405);
    
  } catch (err) {
    logger.error('❌ Alerts error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
