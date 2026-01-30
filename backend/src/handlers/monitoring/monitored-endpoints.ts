/**
 * Lambda handler for Monitored Endpoints CRUD
 * Gerencia endpoints monitorados (criar, listar, atualizar, deletar)
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { isOrganizationInDemoMode, generateDemoMonitoredEndpoints } from '../../lib/demo-data-service.js';
import { createMonitoredEndpointSchema, updateMonitoredEndpointSchema, deleteMonitoredEndpointSchema } from '../../lib/schemas.js';
import { parseAndValidateBody } from '../../lib/validation.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Monitored Endpoints handler started');
  
  const method = getHttpMethod(event);
  
  if (method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();
    
    // ============================================
    // DEMO MODE CHECK - Return demo data if enabled (GET only)
    // ============================================
    if (method === 'GET') {
      const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
      if (isDemo === true) {
        logger.info('Returning demo monitored endpoints data', { organizationId, isDemo: true });
        const demoData = generateDemoMonitoredEndpoints();
        return success(demoData);
      }
    }
    
    // GET - Listar endpoints
    if (method === 'GET') {
      const endpoints = await prisma.monitoredEndpoint.findMany({
        where: { organization_id: organizationId },
        orderBy: { created_at: 'desc' },
        include: {
          check_history: {
            take: 10,
            orderBy: { checked_at: 'desc' },
          },
        },
      });
      
      return success(endpoints);
    }
    
    // POST - Criar endpoint
    if (method === 'POST') {
      const validation = parseAndValidateBody(createMonitoredEndpointSchema, event.body);
      if (!validation.success) {
        return validation.error;
      }
      const { name, url, timeout, is_active, alert_on_failure, monitor_ssl, ssl_alert_days } = validation.data;
      
      const endpoint = await prisma.monitoredEndpoint.create({
        data: {
          organization_id: organizationId,
          name,
          url,
          timeout,
          is_active,
          alert_on_failure,
          monitor_ssl,
          ssl_alert_days,
        },
      });
      
      logger.info(`✅ Endpoint created: ${endpoint.id}`);
      
      return success(endpoint, 201);
    }
    
    // PUT - Atualizar endpoint
    if (method === 'PUT') {
      const validation = parseAndValidateBody(updateMonitoredEndpointSchema, event.body);
      if (!validation.success) {
        return validation.error;
      }
      const { id, name, url, timeout, is_active, alert_on_failure, monitor_ssl, ssl_alert_days } = validation.data;
      
      // Verificar se endpoint pertence à organização
      const existing = await prisma.monitoredEndpoint.findFirst({
        where: { id, organization_id: organizationId },
      });
      
      if (!existing) {
        return error('Endpoint não encontrado', 404);
      }
      
      const endpoint = await prisma.monitoredEndpoint.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(url && { url }),
          ...(timeout !== undefined && { timeout }),
          ...(is_active !== undefined && { is_active }),
          ...(alert_on_failure !== undefined && { alert_on_failure }),
          ...(monitor_ssl !== undefined && { monitor_ssl }),
          ...(ssl_alert_days !== undefined && { ssl_alert_days }),
        },
      });
      
      logger.info(`✅ Endpoint updated: ${endpoint.id}`);
      
      return success(endpoint);
    }
    
    // DELETE - Deletar endpoint
    if (method === 'DELETE') {
      let endpointId: string | undefined;
      
      if (event.body) {
        const validation = parseAndValidateBody(deleteMonitoredEndpointSchema, event.body);
        if (!validation.success) {
          return validation.error;
        }
        endpointId = validation.data.id;
      } else {
        endpointId = event.queryStringParameters?.id;
      }
      
      if (!endpointId) {
        return badRequest('ID do endpoint é obrigatório');
      }
      
      // Verificar se endpoint pertence à organização
      const existing = await prisma.monitoredEndpoint.findFirst({
        where: { id: endpointId, organization_id: organizationId },
      });
      
      if (!existing) {
        return error('Endpoint não encontrado', 404);
      }
      
      await prisma.monitoredEndpoint.delete({
        where: { id: endpointId },
      });
      
      logger.info(`✅ Endpoint deleted: ${endpointId}`);
      
      return success({ success: true, message: 'Endpoint deletado com sucesso' });
    }
    
    return error('Método não suportado', 405);
    
  } catch (err) {
    logger.error('❌ Monitored Endpoints error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
