import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Endpoint Monitor Check
 * AWS Lambda Handler for endpoint-monitor-check
 * 
 * Monitora disponibilidade e performance de endpoints
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
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
  event: AuthorizedEvent | any,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Endpoint Monitor Check started');
  
  // Check if this is an EventBridge scheduled event (no HTTP context)
  const isScheduledEvent = !event.requestContext?.http && !event.httpMethod;
  
  if (!isScheduledEvent && getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const prisma = getPrismaClient();
    let organizationId: string | undefined;
    let endpointId: string | undefined;
    
    // If called from API with auth, filter by organization
    // If called from EventBridge, check ALL active endpoints
    if (!isScheduledEvent) {
      try {
        const user = getUserFromEvent(event);
        organizationId = getOrganizationIdWithImpersonation(event, user);
        const body: EndpointMonitorCheckRequest = event.body ? JSON.parse(event.body) : {};
        endpointId = body.endpointId;
      } catch {
        // If no auth, proceed without org filter (scheduled job)
      }
    }
    
    // Buscar endpoints para monitorar
    const endpoints = await prisma.monitoredEndpoint.findMany({
      where: {
        is_active: true,
        ...(organizationId && { organization_id: organizationId }),
        ...(endpointId && { id: endpointId }),
      },
    });
    
    if (endpoints.length === 0) {
      logger.info('No active endpoints to monitor');
      return success({
        success: true,
        message: 'No active endpoints to monitor',
        results: [],
      });
    }
    
    logger.info(`Found ${endpoints.length} endpoints to check`);
    
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
      
      // Atualizar status do endpoint (incluindo SSL)
      await prisma.monitoredEndpoint.update({
        where: { id: endpoint.id },
        data: {
          last_status: result.status,
          last_checked_at: new Date(),
          last_response_time: result.responseTime,
          ...(result.sslInfo && {
            ssl_valid: result.sslInfo.valid,
            ssl_expiry_date: result.sslInfo.expiryDate,
            ssl_issuer: result.sslInfo.issuer,
          }),
        },
      });
      
      // Criar alerta se endpoint estiver down
      if (result.status === 'down' && endpoint.alert_on_failure) {
        await prisma.alert.create({
          data: {
            organization_id: endpoint.organization_id,
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
      
      // Criar alerta se SSL estiver expirando
      if (result.sslInfo && endpoint.monitor_ssl && result.sslInfo.daysUntilExpiry !== undefined) {
        const alertDays = endpoint.ssl_alert_days || 30;
        if (result.sslInfo.daysUntilExpiry <= alertDays && result.sslInfo.daysUntilExpiry > 0) {
          // Check if alert already exists for this endpoint
          const existingAlert = await prisma.alert.findFirst({
            where: {
              organization_id: endpoint.organization_id,
              title: { contains: `SSL Expiring: ${endpoint.name}` },
              resolved_at: null,
            },
          });
          
          if (!existingAlert) {
            await prisma.alert.create({
              data: {
                organization_id: endpoint.organization_id,
                severity: result.sslInfo.daysUntilExpiry <= 7 ? 'CRITICAL' : 'HIGH',
                title: `SSL Expiring: ${endpoint.name}`,
                message: `SSL certificate for ${endpoint.url} expires in ${result.sslInfo.daysUntilExpiry} days (${result.sslInfo.expiryDate?.toLocaleDateString()})`,
                metadata: {
                  endpointId: endpoint.id,
                  url: endpoint.url,
                  sslExpiryDate: result.sslInfo.expiryDate,
                  daysUntilExpiry: result.sslInfo.daysUntilExpiry,
                  issuer: result.sslInfo.issuer,
                },
                triggered_at: new Date(),
              },
            });
          }
        } else if (result.sslInfo.daysUntilExpiry <= 0) {
          await prisma.alert.create({
            data: {
              organization_id: endpoint.organization_id,
              severity: 'CRITICAL',
              title: `SSL Expired: ${endpoint.name}`,
              message: `SSL certificate for ${endpoint.url} has EXPIRED!`,
              metadata: {
                endpointId: endpoint.id,
                url: endpoint.url,
                sslExpiryDate: result.sslInfo.expiryDate,
              },
              triggered_at: new Date(),
            },
          });
        }
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
        avgResponseTime: results.length > 0 ? results.reduce((sum, r) => sum + r.responseTime, 0) / results.length : 0,
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
  sslInfo?: {
    valid: boolean;
    expiryDate?: Date;
    issuer?: string;
    daysUntilExpiry?: number;
  };
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
    
    // Check SSL if HTTPS
    let sslInfo: { valid: boolean; expiryDate?: Date; issuer?: string; daysUntilExpiry?: number } | undefined;
    if (url.startsWith('https://')) {
      sslInfo = await checkSSL(url);
    }
    
    return {
      status,
      statusCode,
      responseTime,
      sslInfo,
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

async function checkSSL(url: string): Promise<{
  valid: boolean;
  expiryDate?: Date;
  issuer?: string;
  daysUntilExpiry?: number;
}> {
  try {
    const https = await import('https');
    const { URL } = await import('url');
    
    const parsedUrl = new URL(url);
    
    return new Promise((resolve) => {
      const req = https.request({
        hostname: parsedUrl.hostname,
        port: 443,
        method: 'HEAD',
        rejectUnauthorized: false,
      }, (res) => {
        const socket = res.socket as any;
        const cert = socket.getPeerCertificate();
        
        if (cert && cert.valid_to) {
          const expiryDate = new Date(cert.valid_to);
          const now = new Date();
          const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          resolve({
            valid: daysUntilExpiry > 0,
            expiryDate,
            issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
            daysUntilExpiry,
          });
        } else {
          resolve({ valid: false });
        }
      });
      
      req.on('error', () => {
        resolve({ valid: false });
      });
      
      req.setTimeout(5000, () => {
        req.destroy();
        resolve({ valid: false });
      });
      
      req.end();
    });
  } catch {
    return { valid: false };
  }
}
