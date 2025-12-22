/**
 * Lambda handler for Endpoint Monitor Check
 * AWS Lambda Handler for endpoint-monitor-check
 * 
 * Monitora disponibilidade e performance de endpoints
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';

interface EndpointMonitorCheckRequest {
  endpointId?: string;
}

interface EndpointCheckResult {
  endpointId: string;
  url: string;
  status: 'up' | 'down' | 'degraded';
  statusCode?: number;
  responseTime: number;
  error?: string;
  checkedAt: Date;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Endpoint Monitor Check started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: EndpointMonitorCheckRequest = event.body ? JSON.parse(event.body) : {};
    const { endpointId } = body;
    
    const prisma = getPrismaClient();
    
    // Buscar endpoints para monitorar
    const endpoints = await prisma.monitoredEndpoint.findMany({
      where: {
        organization_id: organizationId,
        is_active: true,
        ...(endpointId && { id: endpointId }),
      },
    });
    
    if (endpoints.length === 0) {
      return success({
        success: true,
        message: 'No active endpoints to monitor',
        results: [],
      });
    }
    
    const results: EndpointCheckResult[] = [];
    
    // Verificar cada endpoint
    for (const endpoint of endpoints) {
      const result = await checkEndpoint(endpoint.url, endpoint.timeout || 5000);
      
      results.push({
        endpointId: endpoint.id,
        url: endpoint.url,
        status: result.status,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
        error: result.error,
        checkedAt: new Date(),
      });
      
      // Salvar resultado no banco
      await prisma.endpointCheckHistory.create({
        data: {
          endpoint_id: endpoint.id,
          status: result.status,
          status_code: result.statusCode,
          response_time: result.responseTime,
          error: result.error,
          checked_at: new Date(),
        },
      });
      
      // Atualizar status do endpoint
      await prisma.monitoredEndpoint.update({
        where: { id: endpoint.id },
        data: {
          last_status: result.status,
          last_checked_at: new Date(),
          last_response_time: result.responseTime,
        },
      });
      
      // Criar alerta se endpoint estiver down
      if (result.status === 'down' && endpoint.alert_on_failure) {
        await prisma.alert.create({
          data: {
            organization_id: organizationId,
            severity: 'HIGH',
            title: `Endpoint Down: ${endpoint.name}`,
            message: `Endpoint ${endpoint.url} is not responding. Error: ${result.error}`,
            metadata: {
              endpointId: endpoint.id,
              url: endpoint.url,
              statusCode: result.statusCode,
              responseTime: result.responseTime,
            },
            triggered_at: new Date(),
          },
        });
      }
    }
    
    const upCount = results.filter(r => r.status === 'up').length;
    const downCount = results.filter(r => r.status === 'down').length;
    const degradedCount = results.filter(r => r.status === 'degraded').length;
    
    logger.info(`✅ Checked ${results.length} endpoints: ${upCount} up, ${downCount} down, ${degradedCount} degraded`);
    
    return success({
      success: true,
      results,
      summary: {
        total: results.length,
        up: upCount,
        down: downCount,
        degraded: degradedCount,
        avgResponseTime: results.reduce((sum, r) => sum + r.responseTime, 0) / results.length,
      },
    });
    
  } catch (err) {
    logger.error('❌ Endpoint Monitor Check error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

async function checkEndpoint(
  url: string,
  timeout: number
): Promise<{
  status: 'up' | 'down' | 'degraded';
  statusCode?: number;
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'EVO-UDS-Monitor/1.0',
      },
    });
    
    clearTimeout(timeoutId);
    
    const responseTime = Date.now() - startTime;
    const statusCode = response.status;
    
    // Determinar status
    let status: 'up' | 'down' | 'degraded';
    if (statusCode >= 200 && statusCode < 300) {
      status = responseTime > 2000 ? 'degraded' : 'up';
    } else if (statusCode >= 500) {
      status = 'down';
    } else {
      status = 'degraded';
    }
    
    return {
      status,
      statusCode,
      responseTime,
    };
    
  } catch (err) {
    const responseTime = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    
    return {
      status: 'down',
      responseTime,
      error: errorMessage,
    };
  }
}
