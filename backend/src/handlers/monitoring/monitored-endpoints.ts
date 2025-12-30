/**
 * Lambda handler for Monitored Endpoints CRUD
 * Gerencia endpoints monitorados (criar, listar, atualizar, deletar)
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod } from '../../lib/middleware.js';

interface CreateEndpointRequest {
  name: string;
  url: string;
  timeout?: number;
  is_active?: boolean;
  alert_on_failure?: boolean;
  monitor_ssl?: boolean;
  ssl_alert_days?: number;
}

interface UpdateEndpointRequest extends Partial<CreateEndpointRequest> {
  id: string;
}

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
    const organizationId = getOrganizationId(user);
    const prisma = getPrismaClient();
    
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
      const body: CreateEndpointRequest = event.body ? JSON.parse(event.body) : {};
      
      if (!body.name || !body.url) {
        return error('Nome e URL são obrigatórios', 400);
      }
      
      // Validar URL
      try {
        new URL(body.url);
      } catch {
        return error('URL inválida', 400);
      }
      
      const endpoint = await prisma.monitoredEndpoint.create({
        data: {
          organization_id: organizationId,
          name: body.name,
          url: body.url,
          timeout: body.timeout || 5000,
          is_active: body.is_active ?? true,
          alert_on_failure: body.alert_on_failure ?? true,
          monitor_ssl: body.monitor_ssl ?? true,
          ssl_alert_days: body.ssl_alert_days || 30,
        },
      });
      
      logger.info(`✅ Endpoint created: ${endpoint.id}`);
      
      return success(endpoint, 201);
    }
    
    // PUT - Atualizar endpoint
    if (method === 'PUT') {
      const body: UpdateEndpointRequest = event.body ? JSON.parse(event.body) : {};
      
      if (!body.id) {
        return error('ID do endpoint é obrigatório', 400);
      }
      
      // Verificar se endpoint pertence à organização
      const existing = await prisma.monitoredEndpoint.findFirst({
        where: { id: body.id, organization_id: organizationId },
      });
      
      if (!existing) {
        return error('Endpoint não encontrado', 404);
      }
      
      const endpoint = await prisma.monitoredEndpoint.update({
        where: { id: body.id },
        data: {
          ...(body.name && { name: body.name }),
          ...(body.url && { url: body.url }),
          ...(body.timeout !== undefined && { timeout: body.timeout }),
          ...(body.is_active !== undefined && { is_active: body.is_active }),
          ...(body.alert_on_failure !== undefined && { alert_on_failure: body.alert_on_failure }),
          ...(body.monitor_ssl !== undefined && { monitor_ssl: body.monitor_ssl }),
          ...(body.ssl_alert_days !== undefined && { ssl_alert_days: body.ssl_alert_days }),
        },
      });
      
      logger.info(`✅ Endpoint updated: ${endpoint.id}`);
      
      return success(endpoint);
    }
    
    // DELETE - Deletar endpoint
    if (method === 'DELETE') {
      const body = event.body ? JSON.parse(event.body) : {};
      const endpointId = body.id || event.queryStringParameters?.id;
      
      if (!endpointId) {
        return error('ID do endpoint é obrigatório', 400);
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
