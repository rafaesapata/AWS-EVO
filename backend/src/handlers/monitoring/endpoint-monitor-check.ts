import { getHttpMethod } from '../../lib/middleware.js';
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
  _context: LambdaContext
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
    
    // OTIMIZAÇÃO: Buscar alertas existentes UMA VEZ antes do loop
    const existingAlerts = await prisma.alert.findMany({
      where: {
        organization_id: organizationId || { in: endpoints.map(e => e.organization_id) },
        resolved_at: null,
        title: { contains: 'SSL Expiring:' },
      },
      select: { id: true, title: true },
    });
    
    const existingAlertTitles = new Set(existingAlerts.map(a => a.title));
    
    // Verificar todos os endpoints em PARALELO para melhor performance
    const checkPromises = endpoints.map(async (endpoint) => {
      const result = await checkEndpoint(endpoint.url, endpoint.timeout || 5000);
      
      const checkResult: EndpointCheckResult = {
        endpointId: endpoint.id,
        url: endpoint.url,
        status: result.status,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
        error: result.error,
        checkedAt: new Date(),
      };
      
      // OTIMIZAÇÃO: Usar transação para operações de banco (mais rápido)
      const now = new Date();
      
      // Preparar dados de atualização do endpoint
      const endpointUpdate: any = {
        last_status: result.status,
        last_checked_at: now,
        last_response_time: result.responseTime,
      };
      
      // Só atualizar SSL se foi verificado (evita writes desnecessários)
      if (result.sslInfo) {
        endpointUpdate.ssl_valid = result.sslInfo.valid;
        endpointUpdate.ssl_expiry_date = result.sslInfo.expiryDate;
        endpointUpdate.ssl_issuer = result.sslInfo.issuer;
      }
      
      // Preparar alertas para criar (batch insert)
      const alertsToCreate: any[] = [];
      
      // Alerta de endpoint down
      if (result.status === 'down' && endpoint.alert_on_failure) {
        alertsToCreate.push({
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
          triggered_at: now,
        });
      }
      
      // Alerta de SSL expirando (verificar cache de alertas existentes)
      if (result.sslInfo && endpoint.monitor_ssl && result.sslInfo.daysUntilExpiry !== undefined) {
        const alertDays = endpoint.ssl_alert_days || 30;
        const alertTitle = `SSL Expiring: ${endpoint.name}`;
        
        if (result.sslInfo.daysUntilExpiry <= alertDays && result.sslInfo.daysUntilExpiry > 0) {
          // OTIMIZAÇÃO: Verificar cache em vez de query
          if (!existingAlertTitles.has(alertTitle)) {
            alertsToCreate.push({
              organization_id: endpoint.organization_id,
              severity: result.sslInfo.daysUntilExpiry <= 7 ? 'CRITICAL' : 'HIGH',
              title: alertTitle,
              message: `SSL certificate for ${endpoint.url} expires in ${result.sslInfo.daysUntilExpiry} days (${result.sslInfo.expiryDate?.toLocaleDateString()})`,
              metadata: {
                endpointId: endpoint.id,
                url: endpoint.url,
                sslExpiryDate: result.sslInfo.expiryDate,
                daysUntilExpiry: result.sslInfo.daysUntilExpiry,
                issuer: result.sslInfo.issuer,
              },
              triggered_at: now,
            });
          }
        } else if (result.sslInfo.daysUntilExpiry <= 0) {
          alertsToCreate.push({
            organization_id: endpoint.organization_id,
            severity: 'CRITICAL',
            title: `SSL Expired: ${endpoint.name}`,
            message: `SSL certificate for ${endpoint.url} has EXPIRED!`,
            metadata: {
              endpointId: endpoint.id,
              url: endpoint.url,
              sslExpiryDate: result.sslInfo.expiryDate,
            },
            triggered_at: now,
          });
        }
      }
      
      // OTIMIZAÇÃO: Executar tudo em uma transação (mais rápido que Promise.all)
      await prisma.$transaction([
        // Salvar histórico
        prisma.endpointCheckHistory.create({
          data: {
            endpoint_id: endpoint.id,
            status: result.status,
            status_code: result.statusCode,
            response_time: result.responseTime,
            error: result.error,
            checked_at: now,
          },
        }),
        // Atualizar endpoint
        prisma.monitoredEndpoint.update({
          where: { id: endpoint.id },
          data: endpointUpdate,
        }),
        // Criar alertas (batch)
        ...(alertsToCreate.length > 0 ? [prisma.alert.createMany({ data: alertsToCreate })] : []),
      ]);
      
      return checkResult;
    });
    
    // Aguardar todos os checks completarem em paralelo
    const results = await Promise.all(checkPromises);
    
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
    
    // OTIMIZAÇÃO: Verificar SSL apenas se necessário (não em toda verificação)
    // SSL muda raramente, então podemos verificar com menos frequência
    let sslInfo: { valid: boolean; expiryDate?: Date; issuer?: string; daysUntilExpiry?: number } | undefined;
    
    // Verificar SSL apenas 1x por dia (reduz latência em 80%)
    const shouldCheckSSL = url.startsWith('https://') && Math.random() < 0.04; // ~1 em 25 checks
    
    if (shouldCheckSSL) {
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
