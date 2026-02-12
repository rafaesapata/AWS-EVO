/**
 * Lambda handler for Fetch Edge Services
 * 
 * Descobre serviços de borda AWS e coleta métricas do CloudWatch
 * Suporta: CloudFront, WAF, ALB, NLB
 * 
 * PERFORMANCE: Usa Redis cache para evitar chamadas repetidas às APIs AWS
 */

import { getHttpMethod } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { edgeCache } from '../../lib/redis-cache.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { CloudWatchClient, GetMetricStatisticsCommand, type Dimension } from '@aws-sdk/client-cloudwatch';
import { CloudFrontClient, ListDistributionsCommand } from '@aws-sdk/client-cloudfront';
import { WAFV2Client, ListWebACLsCommand, GetWebACLCommand } from '@aws-sdk/client-wafv2';
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { randomUUID } from 'crypto';
import { isOrganizationInDemoMode, generateDemoEdgeServices } from '../../lib/demo-data-service.js';

// Zod schema for fetch edge services request
const fetchEdgeServicesRequestSchema = z.object({
  accountId: z.string().min(1, 'accountId is required'),
  regions: z.array(z.string()).optional(),
  forceRefresh: z.boolean().default(false),
});

interface EdgeServiceInfo {
  serviceType: 'cloudfront' | 'waf' | 'load_balancer';
  serviceName: string;
  serviceId: string;
  status: string;
  region: string;
  domainName?: string;
  originDomain?: string;
  metadata?: Record<string, any>;
}

// Regiões padrão para scan (CloudFront e WAF global usam us-east-1)
const DEFAULT_REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'sa-east-1'];

// Cache TTL em segundos
const CACHE_TTL = 5 * 60; // 5 minutos

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Fetch Edge Services started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const prisma = getPrismaClient();
    
    // ============================================
    // DEMO MODE CHECK - Return demo data if enabled
    // Check BEFORE accountId validation for demo mode
    // ============================================
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    if (isDemo === true) {
      logger.info('Returning demo edge services data', { organizationId, isDemo: true });
      const demoData = generateDemoEdgeServices();
      return success(demoData);
    }
    
    const validation = parseAndValidateBody(fetchEdgeServicesRequestSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { accountId, regions = DEFAULT_REGIONS, forceRefresh } = validation.data;
    
    // Buscar credenciais AWS
    const account = await prisma.awsCredential.findFirst({
      where: {
        id: accountId,
        organization_id: organizationId,
        is_active: true,
      },
    });
    
    if (!account) {
      // Check if this might be an Azure credential
      const azureAccount = await prisma.azureCredential.findFirst({
        where: {
          id: accountId,
          organization_id: organizationId,
        },
      });
      
      if (azureAccount) {
        return error('Edge Services (CloudFront, WAF, Load Balancers) is an AWS-only feature. Please select an AWS account.', 400);
      }
      
      return error('AWS account not found or inactive', 404);
    }
    
    // ============================================
    // REDIS CACHE: Verificar se há dados em cache
    // ============================================
    if (!forceRefresh) {
      try {
        const cacheInfo = await edgeCache.getCacheInfo(accountId);
        
        if (cacheInfo.hasCache) {
          logger.info(`📦 Cache HIT for account ${accountId}, age: ${cacheInfo.cacheAge}s`);
          
          // Retornar dados do cache se ainda válido
          const cached = await edgeCache.getDiscoveryResult(accountId);
          if (cached) {
            return success({
              success: true,
              message: `Dados do cache (${cacheInfo.cacheAge}s atrás)`,
              servicesFound: cacheInfo.serviceCount || 0,
              metricsCollected: cacheInfo.metricCount || 0,
              breakdown: cached.breakdown,
              regionsScanned: cached.regionsScanned,
              permissionErrors: cached.permissionErrors,
              fromCache: true,
              cacheAge: cacheInfo.cacheAge,
            });
          }
        }
      } catch (cacheError: unknown) {
        // Se Redis falhar, continuar sem cache
        logger.warn('Redis cache check failed, proceeding without cache', { error: cacheError instanceof Error ? cacheError.message : String(cacheError) });
      }
    } else {
      logger.info(`🔄 Force refresh requested, bypassing cache for account ${accountId}`);
    }
    
    logger.info(`📊 Discovering edge services for account ${account.account_name}`);
    
    const allServices: EdgeServiceInfo[] = [];
    const permissionErrors: Array<{ serviceType: string; region: string; error: string }> = [];
    
    // CloudFront é global - usar us-east-1
    const globalCreds = await resolveAwsCredentials(account, 'us-east-1');
    const globalCredentials = toAwsCredentials(globalCreds);
    
    // Descobrir CloudFront distributions
    const cloudfrontServices = await discoverCloudFrontDistributions(globalCredentials, permissionErrors);
    allServices.push(...cloudfrontServices);
    
    // Descobrir WAF Web ACLs (global scope)
    const wafGlobalServices = await discoverWAFWebACLs(globalCredentials, 'CLOUDFRONT', 'global', permissionErrors);
    allServices.push(...wafGlobalServices);
    
    // Descobrir recursos regionais
    for (const region of regions) {
      const resolvedCreds = await resolveAwsCredentials(account, region);
      const credentials = toAwsCredentials(resolvedCreds);
      
      // WAF regional
      const wafRegionalServices = await discoverWAFWebACLs(credentials, 'REGIONAL', region, permissionErrors);
      allServices.push(...wafRegionalServices);
      
      // Load Balancers (ALB/NLB)
      const lbServices = await discoverLoadBalancers(credentials, region, permissionErrors);
      allServices.push(...lbServices);
    }
    
    logger.info(`📦 Found ${allServices.length} edge services`);
    
    // Salvar serviços no banco e coletar métricas
    let metricsCollected = 0;
    
    for (const service of allServices) {
      // Salvar/atualizar serviço
      const savedService = await upsertEdgeService(prisma, organizationId, accountId, service);
      
      if (savedService) {
        // Coletar métricas para o serviço
        const metricsRegion = service.region === 'global' ? 'us-east-1' : service.region;
        const resolvedCreds = await resolveAwsCredentials(account, metricsRegion);
        const credentials = toAwsCredentials(resolvedCreds);
        
        const metrics = await collectEdgeMetrics(credentials, metricsRegion, service);
        
        if (metrics) {
          await saveEdgeMetrics(prisma, organizationId, accountId, savedService.id, metrics);
          metricsCollected++;
          
          // Atualizar estatísticas do serviço
          await updateServiceStats(prisma, savedService.id, metrics);
        }
      }
    }
    
    logger.info(`✅ Saved ${allServices.length} services, collected ${metricsCollected} metrics`);
    
    const breakdown = {
      cloudfront: allServices.filter(s => s.serviceType === 'cloudfront').length,
      waf: allServices.filter(s => s.serviceType === 'waf').length,
      loadBalancer: allServices.filter(s => s.serviceType === 'load_balancer').length,
    };
    
    // ============================================
    // REDIS CACHE: Salvar resultado no cache
    // ============================================
    try {
      await edgeCache.cacheDiscoveryResult(accountId, {
        services: allServices,
        metrics: [], // Métricas são salvas no banco, não precisamos cachear aqui
        regionsScanned: regions,
        permissionErrors: permissionErrors.length > 0 ? permissionErrors : undefined,
        breakdown,
      }, CACHE_TTL);
      
      logger.info(`📦 Cached discovery result for account ${accountId}, TTL: ${CACHE_TTL}s`);
    } catch (cacheError: unknown) {
      // Se Redis falhar ao salvar, apenas logar
      logger.warn('Failed to cache discovery result', { error: cacheError instanceof Error ? cacheError.message : String(cacheError) });
    }
    
    return success({
      success: true,
      message: `Descobertos ${allServices.length} serviços de borda`,
      servicesFound: allServices.length,
      metricsCollected,
      breakdown,
      regionsScanned: regions,
      permissionErrors: permissionErrors.length > 0 ? permissionErrors : undefined,
      fromCache: false,
    });
    
  } catch (err) {
    logger.error('❌ Fetch Edge Services error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
  }
}


// Descobrir CloudFront distributions
async function discoverCloudFrontDistributions(
  credentials: any,
  permissionErrors: any[]
): Promise<EdgeServiceInfo[]> {
  try {
    const client = new CloudFrontClient({ region: 'us-east-1', credentials });
    const response = await client.send(new ListDistributionsCommand({}));
    
    return (response.DistributionList?.Items || []).map(dist => ({
      serviceType: 'cloudfront' as const,
      serviceName: dist.Comment || dist.DomainName || dist.Id || 'CloudFront Distribution',
      serviceId: dist.Id || '',
      status: dist.Status === 'Deployed' ? 'active' : 'inactive',
      region: 'global',
      domainName: dist.DomainName,
      originDomain: dist.Origins?.Items?.[0]?.DomainName,
      metadata: {
        aliases: dist.Aliases?.Items || [],
        priceClass: dist.PriceClass,
        httpVersion: dist.HttpVersion,
        isIPV6Enabled: dist.IsIPV6Enabled,
        webACLId: dist.WebACLId,
        enabled: dist.Enabled,
      },
    }));
  } catch (err: any) {
    logger.warn(`CloudFront discovery failed: ${err.message}`);
    if (err.name === 'AccessDeniedException') {
      permissionErrors.push({
        serviceType: 'cloudfront',
        region: 'global',
        error: err.message,
      });
    }
    return [];
  }
}

// Descobrir WAF Web ACLs
async function discoverWAFWebACLs(
  credentials: any,
  scope: 'CLOUDFRONT' | 'REGIONAL',
  region: string,
  permissionErrors: any[]
): Promise<EdgeServiceInfo[]> {
  try {
    const client = new WAFV2Client({ 
      region: scope === 'CLOUDFRONT' ? 'us-east-1' : region, 
      credentials 
    });
    
    const response = await client.send(new ListWebACLsCommand({ Scope: scope }));
    
    const services: EdgeServiceInfo[] = [];
    
    for (const acl of response.WebACLs || []) {
      // Obter detalhes do Web ACL
      let rulesCount = 0;
      try {
        const aclDetails = await client.send(new GetWebACLCommand({
          Name: acl.Name || '',
          Scope: scope,
          Id: acl.Id || '',
        }));
        rulesCount = aclDetails.WebACL?.Rules?.length || 0;
      } catch {
        // Ignorar erro ao obter detalhes
      }
      
      services.push({
        serviceType: 'waf' as const,
        serviceName: acl.Name || 'WAF Web ACL',
        serviceId: acl.Id || '',
        status: 'active',
        region: scope === 'CLOUDFRONT' ? 'global' : region,
        metadata: {
          arn: acl.ARN,
          scope,
          rulesCount,
          lockToken: acl.LockToken,
        },
      });
    }
    
    return services;
  } catch (err: any) {
    logger.warn(`WAF discovery failed in ${region}: ${err.message}`);
    if (err.name === 'AccessDeniedException' || err.name === 'WAFNonexistentItemException') {
      permissionErrors.push({
        serviceType: 'waf',
        region,
        error: err.message,
      });
    }
    return [];
  }
}

// Descobrir Load Balancers (ALB/NLB)
async function discoverLoadBalancers(
  credentials: any,
  region: string,
  permissionErrors: any[]
): Promise<EdgeServiceInfo[]> {
  try {
    const client = new ElasticLoadBalancingV2Client({ region, credentials });
    const response = await client.send(new DescribeLoadBalancersCommand({}));
    
    return (response.LoadBalancers || []).map(lb => ({
      serviceType: 'load_balancer' as const,
      serviceName: lb.LoadBalancerName || 'Load Balancer',
      serviceId: lb.LoadBalancerArn || '',
      status: lb.State?.Code === 'active' ? 'active' : 'inactive',
      region,
      domainName: lb.DNSName,
      metadata: {
        type: lb.Type, // 'application' or 'network'
        scheme: lb.Scheme, // 'internet-facing' or 'internal'
        vpcId: lb.VpcId,
        availabilityZones: lb.AvailabilityZones?.map(az => az.ZoneName),
        securityGroups: lb.SecurityGroups,
        ipAddressType: lb.IpAddressType,
      },
    }));
  } catch (err: any) {
    logger.warn(`ELB discovery failed in ${region}: ${err.message}`);
    if (err.name === 'AccessDeniedException') {
      permissionErrors.push({
        serviceType: 'load_balancer',
        region,
        error: err.message,
      });
    }
    return [];
  }
}

// Coletar métricas de serviços de borda
async function collectEdgeMetrics(
  credentials: any,
  region: string,
  service: EdgeServiceInfo
): Promise<EdgeMetricsData | null> {
  try {
    const cwClient = new CloudWatchClient({ region, credentials });
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // 1 hour ago
    
    let metrics: EdgeMetricsData = {
      timestamp: new Date(),
      requests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      blockedRequests: 0,
      responseTime: 0,
      bandwidthGb: 0,
      error4xx: 0,
      error5xx: 0,
    };
    
    if (service.serviceType === 'cloudfront') {
      metrics = await collectCloudFrontMetrics(cwClient, service.serviceId, startTime, endTime);
    } else if (service.serviceType === 'waf') {
      metrics = await collectWAFMetrics(cwClient, service, startTime, endTime);
    } else if (service.serviceType === 'load_balancer') {
      metrics = await collectLoadBalancerMetrics(cwClient, service, startTime, endTime);
    }
    
    return metrics;
  } catch (err) {
    logger.warn(`Failed to collect metrics for ${service.serviceId}: ${err}`);
    return null;
  }
}

interface EdgeMetricsData {
  timestamp: Date;
  requests: number;
  cacheHits: number;
  cacheMisses: number;
  blockedRequests: number;
  responseTime: number;
  bandwidthGb: number;
  error4xx: number;
  error5xx: number;
}

// Coletar métricas do CloudFront
async function collectCloudFrontMetrics(
  client: CloudWatchClient,
  distributionId: string,
  startTime: Date,
  endTime: Date
): Promise<EdgeMetricsData> {
  const dimensions: Dimension[] = [
    { Name: 'DistributionId', Value: distributionId },
    { Name: 'Region', Value: 'Global' },
  ];
  
  const [requests, bytesDownloaded, error4xx, error5xx] = await Promise.all([
    getMetricSum(client, 'AWS/CloudFront', 'Requests', dimensions, startTime, endTime),
    getMetricSum(client, 'AWS/CloudFront', 'BytesDownloaded', dimensions, startTime, endTime),
    getMetricSum(client, 'AWS/CloudFront', '4xxErrorRate', dimensions, startTime, endTime),
    getMetricSum(client, 'AWS/CloudFront', '5xxErrorRate', dimensions, startTime, endTime),
  ]);
  
  // CloudFront não tem métricas de cache hit diretas, estimamos baseado em origin requests
  const cacheHitRate = 0.85; // Estimativa padrão
  
  return {
    timestamp: new Date(),
    requests: Math.round(requests),
    cacheHits: Math.round(requests * cacheHitRate),
    cacheMisses: Math.round(requests * (1 - cacheHitRate)),
    blockedRequests: 0,
    responseTime: 0,
    bandwidthGb: bytesDownloaded / (1024 * 1024 * 1024),
    error4xx: Math.round(requests * (error4xx / 100)),
    error5xx: Math.round(requests * (error5xx / 100)),
  };
}

// Coletar métricas do WAF
async function collectWAFMetrics(
  client: CloudWatchClient,
  service: EdgeServiceInfo,
  startTime: Date,
  endTime: Date
): Promise<EdgeMetricsData> {
  const webAclName = service.serviceName;
  const scope = service.metadata?.scope as string || 'REGIONAL';
  const region = scope === 'CLOUDFRONT' ? 'Global' : service.region;
  
  // Dimensões corretas para WAFv2:
  // - WebACL: Nome do Web ACL
  // - Region: 'Global' para CloudFront ou nome da região para regional
  // - Rule: 'ALL' para todas as regras
  const dimensions: Dimension[] = [
    { Name: 'WebACL', Value: webAclName },
    { Name: 'Region', Value: region },
    { Name: 'Rule', Value: 'ALL' },
  ];
  
  logger.info(`📊 Collecting WAF metrics for ${webAclName} in ${region} with dimensions:`, { dimensions });
  
  const [allowedRequests, blockedRequests] = await Promise.all([
    getMetricSum(client, 'AWS/WAFV2', 'AllowedRequests', dimensions, startTime, endTime),
    getMetricSum(client, 'AWS/WAFV2', 'BlockedRequests', dimensions, startTime, endTime),
  ]);
  
  logger.info(`📊 WAF metrics for ${webAclName}: allowed=${allowedRequests}, blocked=${blockedRequests}`);
  
  return {
    timestamp: new Date(),
    requests: Math.round(allowedRequests + blockedRequests),
    cacheHits: 0,
    cacheMisses: 0,
    blockedRequests: Math.round(blockedRequests),
    responseTime: 0,
    bandwidthGb: 0,
    error4xx: 0,
    error5xx: 0,
  };
}

// Coletar métricas do Load Balancer
async function collectLoadBalancerMetrics(
  client: CloudWatchClient,
  service: EdgeServiceInfo,
  startTime: Date,
  endTime: Date
): Promise<EdgeMetricsData> {
  // Extrair o identificador do LB do ARN
  const arnParts = service.serviceId.split(':loadbalancer/');
  const lbDimension = arnParts[1] || service.serviceName;
  
  const isALB = service.metadata?.type === 'application';
  const namespace = isALB ? 'AWS/ApplicationELB' : 'AWS/NetworkELB';
  
  const dimensions: Dimension[] = [
    { Name: 'LoadBalancer', Value: lbDimension },
  ];
  
  if (isALB) {
    const [requestCount, responseTime, target2xx, target4xx, target5xx] = await Promise.all([
      getMetricSum(client, namespace, 'RequestCount', dimensions, startTime, endTime),
      getMetricAvg(client, namespace, 'TargetResponseTime', dimensions, startTime, endTime),
      getMetricSum(client, namespace, 'HTTPCode_Target_2XX_Count', dimensions, startTime, endTime),
      getMetricSum(client, namespace, 'HTTPCode_Target_4XX_Count', dimensions, startTime, endTime),
      getMetricSum(client, namespace, 'HTTPCode_Target_5XX_Count', dimensions, startTime, endTime),
    ]);
    
    return {
      timestamp: new Date(),
      requests: Math.round(requestCount),
      cacheHits: 0,
      cacheMisses: 0,
      blockedRequests: 0,
      responseTime: responseTime * 1000, // Convert to ms
      bandwidthGb: 0,
      error4xx: Math.round(target4xx),
      error5xx: Math.round(target5xx),
    };
  } else {
    // NLB metrics
    const [processedBytes, activeFlows] = await Promise.all([
      getMetricSum(client, namespace, 'ProcessedBytes', dimensions, startTime, endTime),
      getMetricAvg(client, namespace, 'ActiveFlowCount', dimensions, startTime, endTime),
    ]);
    
    return {
      timestamp: new Date(),
      requests: Math.round(activeFlows),
      cacheHits: 0,
      cacheMisses: 0,
      blockedRequests: 0,
      responseTime: 0,
      bandwidthGb: processedBytes / (1024 * 1024 * 1024),
      error4xx: 0,
      error5xx: 0,
    };
  }
}


// Helper: Obter soma de métrica
async function getMetricSum(
  client: CloudWatchClient,
  namespace: string,
  metricName: string,
  dimensions: Dimension[],
  startTime: Date,
  endTime: Date
): Promise<number> {
  try {
    const response = await client.send(new GetMetricStatisticsCommand({
      Namespace: namespace,
      MetricName: metricName,
      Dimensions: dimensions,
      StartTime: startTime,
      EndTime: endTime,
      Period: 3600, // 1 hour
      Statistics: ['Sum'],
    }));
    
    const sum = response.Datapoints?.reduce((acc, dp) => acc + (dp.Sum || 0), 0) || 0;
    
    if (response.Datapoints?.length === 0) {
      logger.debug(`No datapoints found for ${namespace}/${metricName}`, { dimensions });
    } else {
      logger.debug(`Got ${response.Datapoints?.length} datapoints for ${namespace}/${metricName}, sum=${sum}`);
    }
    
    return sum;
  } catch (err: any) {
    logger.warn(`Failed to get metric ${namespace}/${metricName}: ${err.message}`, { dimensions });
    return 0;
  }
}

// Helper: Obter média de métrica
async function getMetricAvg(
  client: CloudWatchClient,
  namespace: string,
  metricName: string,
  dimensions: Dimension[],
  startTime: Date,
  endTime: Date
): Promise<number> {
  try {
    const response = await client.send(new GetMetricStatisticsCommand({
      Namespace: namespace,
      MetricName: metricName,
      Dimensions: dimensions,
      StartTime: startTime,
      EndTime: endTime,
      Period: 3600,
      Statistics: ['Average'],
    }));
    
    const datapoints = response.Datapoints || [];
    if (datapoints.length === 0) return 0;
    
    const sum = datapoints.reduce((acc, dp) => acc + (dp.Average || 0), 0);
    return sum / datapoints.length;
  } catch {
    return 0;
  }
}

// Upsert serviço de borda no banco
async function upsertEdgeService(
  prisma: any,
  organizationId: string,
  accountId: string,
  service: EdgeServiceInfo
): Promise<{ id: string } | null> {
  try {
    const existing = await prisma.edgeService.findFirst({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
        service_id: service.serviceId,
      },
    });
    
    const data = {
      cloud_provider: 'AWS',
      service_type: service.serviceType,
      service_name: service.serviceName,
      status: service.status,
      region: service.region,
      domain_name: service.domainName,
      origin_domain: service.originDomain,
      metadata: service.metadata,
      last_updated: new Date(),
    };
    
    if (existing) {
      await prisma.edgeService.update({
        where: { id: existing.id },
        data,
      });
      return { id: existing.id };
    } else {
      const created = await prisma.edgeService.create({
        data: {
          id: randomUUID(),
          organization_id: organizationId,
          aws_account_id: accountId,
          service_id: service.serviceId,
          ...data,
          created_at: new Date(),
        },
      });
      return { id: created.id };
    }
  } catch (err) {
    logger.warn(`Failed to upsert edge service ${service.serviceId}: ${err}`);
    return null;
  }
}

// Salvar métricas de borda no banco
async function saveEdgeMetrics(
  prisma: any,
  organizationId: string,
  accountId: string,
  serviceId: string,
  metrics: EdgeMetricsData
): Promise<void> {
  try {
    // Verificar se já existe métrica para este timestamp (arredondado para hora)
    const roundedTimestamp = new Date(metrics.timestamp);
    roundedTimestamp.setMinutes(0, 0, 0);
    
    const existing = await prisma.edgeMetric.findFirst({
      where: {
        service_id: serviceId,
        timestamp: roundedTimestamp,
      },
    });
    
    if (!existing) {
      await prisma.edgeMetric.create({
        data: {
          id: randomUUID(),
          organization_id: organizationId,
          cloud_provider: 'AWS',
          aws_account_id: accountId,
          service_id: serviceId,
          timestamp: roundedTimestamp,
          requests: metrics.requests,
          cache_hits: metrics.cacheHits,
          cache_misses: metrics.cacheMisses,
          blocked_requests: metrics.blockedRequests,
          response_time: metrics.responseTime,
          bandwidth_gb: metrics.bandwidthGb,
          error_4xx: metrics.error4xx,
          error_5xx: metrics.error5xx,
          created_at: new Date(),
        },
      });
    }
  } catch (err) {
    // Ignorar erros de duplicação
    if (!(err as any)?.code?.includes('P2002')) {
      logger.warn(`Failed to save edge metrics: ${err}`);
    }
  }
}

// Atualizar estatísticas do serviço
async function updateServiceStats(
  prisma: any,
  serviceId: string,
  metrics: EdgeMetricsData
): Promise<void> {
  try {
    const totalRequests = metrics.requests || 1;
    const cacheHitRate = totalRequests > 0 ? (metrics.cacheHits / totalRequests) * 100 : 0;
    const errorRate = totalRequests > 0 ? ((metrics.error4xx + metrics.error5xx) / totalRequests) * 100 : 0;
    
    await prisma.edgeService.update({
      where: { id: serviceId },
      data: {
        requests_per_minute: metrics.requests / 60, // Aproximação
        cache_hit_rate: cacheHitRate,
        error_rate: errorRate,
        blocked_requests: metrics.blockedRequests,
        last_updated: new Date(),
      },
    });
  } catch (err) {
    logger.warn(`Failed to update service stats: ${err}`);
  }
}
