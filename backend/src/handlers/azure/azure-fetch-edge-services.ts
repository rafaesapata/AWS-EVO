/**
 * Lambda handler for Azure Fetch Edge Services
 * 
 * Discovers Azure edge/networking services and collects metrics from Azure Monitor
 * Supports: Front Door, Application Gateway, Load Balancer, NAT Gateway, API Management, Azure WAF
 * 
 * PERFORMANCE: Uses Redis cache to avoid repeated Azure API calls
 */

// IMPORTANTE: Crypto polyfill DEVE ser o primeiro import
import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}

import { getHttpMethod } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { edgeCache } from '../../lib/redis-cache.js';
import { randomUUID } from 'crypto';
import { isOrganizationInDemoMode, generateDemoAzureEdgeServices } from '../../lib/demo-data-service.js';

interface FetchAzureEdgeServicesRequest {
  accountId: string; // Azure credential ID
  forceRefresh?: boolean;
}

interface AzureEdgeServiceInfo {
  serviceType: 'front_door' | 'azure_waf' | 'application_gateway' | 'load_balancer' | 'nat_gateway' | 'api_management';
  serviceName: string;
  serviceId: string;
  status: string;
  region: string;
  domainName?: string;
  metadata?: Record<string, any>;
}

// Cache TTL in seconds
const CACHE_TTL = 5 * 60; // 5 minutes

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Azure Fetch Edge Services started');

  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const prisma = getPrismaClient();
    
    // ============================================
    // DEMO MODE CHECK - Return demo data if enabled
    // ============================================
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    if (isDemo === true) {
      logger.info('Returning demo Azure edge services data', { organizationId, isDemo: true });
      const demoData = generateDemoAzureEdgeServices();
      return success(demoData);
    }
    
    const body: FetchAzureEdgeServicesRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, forceRefresh = false } = body;
    
    if (!accountId) {
      return error('Missing required parameter: accountId');
    }
    
    // Fetch Azure credentials
    const azureCredential = await prisma.azureCredential.findFirst({
      where: {
        id: accountId,
        organization_id: organizationId,
        is_active: true,
      },
    });
    
    if (!azureCredential) {
      // Check if this might be an AWS credential
      const awsAccount = await prisma.awsCredential.findFirst({
        where: {
          id: accountId,
          organization_id: organizationId,
        },
      });
      
      if (awsAccount) {
        return error('This is an AWS account. Use the AWS Edge Services endpoint instead.');
      }
      
      return error('Azure credential not found or inactive');
    }
    
    // ============================================
    // REDIS CACHE: Check for cached data
    // ============================================
    const cacheKey = `azure-edge-${accountId}`;
    if (!forceRefresh) {
      try {
        const cacheInfo = await edgeCache.getCacheInfo(cacheKey);
        
        if (cacheInfo.hasCache) {
          logger.info(`📦 Cache HIT for Azure account ${accountId}, age: ${cacheInfo.cacheAge}s`);
          
          const cached = await edgeCache.getDiscoveryResult(cacheKey);
          if (cached) {
            return success({
              success: true,
              message: `Data from cache (${cacheInfo.cacheAge}s ago)`,
              servicesFound: cacheInfo.serviceCount || 0,
              metricsCollected: cacheInfo.metricCount || 0,
              breakdown: cached.breakdown,
              permissionErrors: cached.permissionErrors,
              fromCache: true,
              cacheAge: cacheInfo.cacheAge,
            });
          }
        }
      } catch (cacheError: unknown) {
        logger.warn('Redis cache check failed, proceeding without cache', { 
          error: cacheError instanceof Error ? cacheError.message : String(cacheError) 
        });
      }
    } else {
      logger.info(`🔄 Force refresh requested, bypassing cache for Azure account ${accountId}`);
    }
    
    logger.info(`📊 Discovering Azure edge services for subscription ${azureCredential.subscription_name || azureCredential.subscription_id}`);
    
    // Get Azure token credential
    const tokenCredential = await getAzureTokenCredential(azureCredential);
    const subscriptionId = azureCredential.subscription_id;
    
    const allServices: AzureEdgeServiceInfo[] = [];
    const permissionErrors: Array<{ serviceType: string; error: string }> = [];
    
    // Discover Azure edge services
    const frontDoorServices = await discoverFrontDoor(tokenCredential, subscriptionId, permissionErrors);
    allServices.push(...frontDoorServices);
    
    const appGatewayServices = await discoverApplicationGateways(tokenCredential, subscriptionId, permissionErrors);
    allServices.push(...appGatewayServices);
    
    const loadBalancerServices = await discoverLoadBalancers(tokenCredential, subscriptionId, permissionErrors);
    allServices.push(...loadBalancerServices);
    
    const natGatewayServices = await discoverNatGateways(tokenCredential, subscriptionId, permissionErrors);
    allServices.push(...natGatewayServices);
    
    const apiManagementServices = await discoverApiManagement(tokenCredential, subscriptionId, permissionErrors);
    allServices.push(...apiManagementServices);
    
    logger.info(`📦 Found ${allServices.length} Azure edge services`);
    
    // Save services to database and collect metrics
    let metricsCollected = 0;
    
    for (const service of allServices) {
      const savedService = await upsertAzureEdgeService(prisma, organizationId, accountId, service);
      
      if (savedService) {
        const metrics = await collectAzureMetrics(tokenCredential, subscriptionId, service);
        
        if (metrics) {
          await saveAzureEdgeMetrics(prisma, organizationId, accountId, savedService.id, metrics);
          metricsCollected++;
          
          await updateAzureServiceStats(prisma, savedService.id, metrics);
        }
      }
    }
    
    logger.info(`✅ Saved ${allServices.length} Azure services, collected ${metricsCollected} metrics`);
    
    const breakdown = {
      frontDoor: allServices.filter(s => s.serviceType === 'front_door').length,
      applicationGateway: allServices.filter(s => s.serviceType === 'application_gateway').length,
      loadBalancer: allServices.filter(s => s.serviceType === 'load_balancer').length,
      natGateway: allServices.filter(s => s.serviceType === 'nat_gateway').length,
      apiManagement: allServices.filter(s => s.serviceType === 'api_management').length,
      azureWaf: allServices.filter(s => s.serviceType === 'azure_waf').length,
    };
    
    // ============================================
    // REDIS CACHE: Save result to cache
    // ============================================
    try {
      await edgeCache.cacheDiscoveryResult(cacheKey, {
        services: allServices,
        metrics: [],
        regionsScanned: ['all'],
        permissionErrors: permissionErrors.length > 0 ? permissionErrors : undefined,
        breakdown,
      }, CACHE_TTL);
      
      logger.info(`📦 Cached Azure discovery result for account ${accountId}, TTL: ${CACHE_TTL}s`);
    } catch (cacheError: unknown) {
      logger.warn('Failed to cache Azure discovery result', { 
        error: cacheError instanceof Error ? cacheError.message : String(cacheError) 
      });
    }
    
    return success({
      success: true,
      message: `Discovered ${allServices.length} Azure edge services`,
      servicesFound: allServices.length,
      metricsCollected,
      breakdown,
      permissionErrors: permissionErrors.length > 0 ? permissionErrors : undefined,
      fromCache: false,
    });
    
  } catch (err) {
    logger.error('❌ Azure Fetch Edge Services error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}


// Get Azure token credential from stored credentials
async function getAzureTokenCredential(credential: any): Promise<any> {
  try {
    if (credential.auth_type === 'oauth' && credential.encrypted_refresh_token) {
      // For OAuth, we need to refresh the token first
      // This is a simplified version - in production, use the refresh flow
      const { ClientSecretCredential } = await import('@azure/identity');
      
      // If we have OAuth but no valid token, fall back to service principal if available
      if (credential.client_id && credential.client_secret && credential.tenant_id) {
        return new ClientSecretCredential(
          credential.tenant_id,
          credential.client_id,
          credential.client_secret
        );
      }
      
      throw new Error('OAuth token expired. Please reconnect your Azure account.');
    }
    
    // Service Principal authentication
    if (credential.client_id && credential.client_secret && credential.tenant_id) {
      const { ClientSecretCredential } = await import('@azure/identity');
      return new ClientSecretCredential(
        credential.tenant_id,
        credential.client_id,
        credential.client_secret
      );
    }
    
    throw new Error('Invalid Azure credentials configuration');
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      throw new Error('Azure SDK not installed');
    }
    throw err;
  }
}

// Discover Azure Front Door profiles
async function discoverFrontDoor(
  credential: any,
  subscriptionId: string,
  permissionErrors: any[]
): Promise<AzureEdgeServiceInfo[]> {
  try {
    const { FrontDoorManagementClient } = await import('@azure/arm-frontdoor');
    const client = new FrontDoorManagementClient(credential, subscriptionId);
    
    const services: AzureEdgeServiceInfo[] = [];
    
    // List Front Door Classic
    for await (const fd of client.frontDoors.list()) {
      services.push({
        serviceType: 'front_door',
        serviceName: fd.name || 'Front Door',
        serviceId: fd.id || '',
        status: fd.enabledState === 'Enabled' ? 'active' : 'inactive',
        region: fd.location || 'global',
        domainName: fd.frontendEndpoints?.[0]?.hostName,
        metadata: {
          resourceState: fd.resourceState,
          frontendEndpoints: fd.frontendEndpoints?.map((e: any) => e.hostName),
          backendPools: fd.backendPools?.map((p: any) => p.name),
          routingRules: fd.routingRules?.length || 0,
          loadBalancingSettings: fd.loadBalancingSettings?.length || 0,
          healthProbeSettings: fd.healthProbeSettings?.length || 0,
          // Check for WAF policy
          hasWaf: fd.frontendEndpoints?.some((e: any) => e.webApplicationFirewallPolicyLink?.id),
        },
      });
      
      // If Front Door has WAF, add it as a separate service
      for (const endpoint of fd.frontendEndpoints || []) {
        if (endpoint.webApplicationFirewallPolicyLink?.id) {
          services.push({
            serviceType: 'azure_waf',
            serviceName: `WAF - ${fd.name}`,
            serviceId: endpoint.webApplicationFirewallPolicyLink.id,
            status: 'active',
            region: fd.location || 'global',
            metadata: {
              associatedWith: 'front_door',
              frontDoorName: fd.name,
              endpointName: endpoint.name,
            },
          });
        }
      }
    }
    
    return services;
  } catch (err: any) {
    logger.warn(`Front Door discovery failed: ${err.message}`);
    if (err.statusCode === 403 || err.code === 'AuthorizationFailed') {
      permissionErrors.push({
        serviceType: 'front_door',
        error: err.message,
      });
    }
    return [];
  }
}

// Discover Azure Application Gateways
async function discoverApplicationGateways(
  credential: any,
  subscriptionId: string,
  permissionErrors: any[]
): Promise<AzureEdgeServiceInfo[]> {
  try {
    const { NetworkManagementClient } = await import('@azure/arm-network');
    const client = new NetworkManagementClient(credential, subscriptionId);
    
    const services: AzureEdgeServiceInfo[] = [];
    
    for await (const appGw of client.applicationGateways.listAll()) {
      services.push({
        serviceType: 'application_gateway',
        serviceName: appGw.name || 'Application Gateway',
        serviceId: appGw.id || '',
        status: appGw.operationalState === 'Running' ? 'active' : 'inactive',
        region: appGw.location || '',
        domainName: appGw.frontendIPConfigurations?.[0]?.publicIPAddress?.id,
        metadata: {
          sku: appGw.sku?.name,
          tier: appGw.sku?.tier,
          capacity: appGw.sku?.capacity,
          operationalState: appGw.operationalState,
          provisioningState: appGw.provisioningState,
          frontendPorts: appGw.frontendPorts?.map(p => p.port),
          backendPools: appGw.backendAddressPools?.length || 0,
          httpListeners: appGw.httpListeners?.length || 0,
          requestRoutingRules: appGw.requestRoutingRules?.length || 0,
          sslCertificates: appGw.sslCertificates?.length || 0,
          hasWaf: appGw.webApplicationFirewallConfiguration?.enabled || false,
          wafMode: appGw.webApplicationFirewallConfiguration?.firewallMode,
        },
      });
      
      // If App Gateway has WAF enabled, add it as a separate service
      if (appGw.webApplicationFirewallConfiguration?.enabled) {
        services.push({
          serviceType: 'azure_waf',
          serviceName: `WAF - ${appGw.name}`,
          serviceId: `${appGw.id}/waf`,
          status: 'active',
          region: appGw.location || '',
          metadata: {
            associatedWith: 'application_gateway',
            appGatewayName: appGw.name,
            firewallMode: appGw.webApplicationFirewallConfiguration.firewallMode,
            ruleSetType: appGw.webApplicationFirewallConfiguration.ruleSetType,
            ruleSetVersion: appGw.webApplicationFirewallConfiguration.ruleSetVersion,
            disabledRuleGroups: appGw.webApplicationFirewallConfiguration.disabledRuleGroups?.length || 0,
          },
        });
      }
    }
    
    return services;
  } catch (err: any) {
    logger.warn(`Application Gateway discovery failed: ${err.message}`);
    if (err.statusCode === 403 || err.code === 'AuthorizationFailed') {
      permissionErrors.push({
        serviceType: 'application_gateway',
        error: err.message,
      });
    }
    return [];
  }
}


// Discover Azure Load Balancers
async function discoverLoadBalancers(
  credential: any,
  subscriptionId: string,
  permissionErrors: any[]
): Promise<AzureEdgeServiceInfo[]> {
  try {
    const { NetworkManagementClient } = await import('@azure/arm-network');
    const client = new NetworkManagementClient(credential, subscriptionId);
    
    const services: AzureEdgeServiceInfo[] = [];
    
    for await (const lb of client.loadBalancers.listAll()) {
      // Skip internal load balancers for edge monitoring (focus on public-facing)
      const hasPublicIP = lb.frontendIPConfigurations?.some(
        fip => fip.publicIPAddress?.id
      );
      
      services.push({
        serviceType: 'load_balancer',
        serviceName: lb.name || 'Load Balancer',
        serviceId: lb.id || '',
        status: lb.provisioningState === 'Succeeded' ? 'active' : 'inactive',
        region: lb.location || '',
        metadata: {
          sku: lb.sku?.name,
          tier: lb.sku?.tier,
          provisioningState: lb.provisioningState,
          isPublic: hasPublicIP,
          frontendIPConfigurations: lb.frontendIPConfigurations?.length || 0,
          backendAddressPools: lb.backendAddressPools?.length || 0,
          loadBalancingRules: lb.loadBalancingRules?.length || 0,
          probes: lb.probes?.length || 0,
          inboundNatRules: lb.inboundNatRules?.length || 0,
          outboundRules: lb.outboundRules?.length || 0,
        },
      });
    }
    
    return services;
  } catch (err: any) {
    logger.warn(`Load Balancer discovery failed: ${err.message}`);
    if (err.statusCode === 403 || err.code === 'AuthorizationFailed') {
      permissionErrors.push({
        serviceType: 'load_balancer',
        error: err.message,
      });
    }
    return [];
  }
}

// Discover Azure NAT Gateways
async function discoverNatGateways(
  credential: any,
  subscriptionId: string,
  permissionErrors: any[]
): Promise<AzureEdgeServiceInfo[]> {
  try {
    const { NetworkManagementClient } = await import('@azure/arm-network');
    const client = new NetworkManagementClient(credential, subscriptionId);
    
    const services: AzureEdgeServiceInfo[] = [];
    
    for await (const natGw of client.natGateways.listAll()) {
      services.push({
        serviceType: 'nat_gateway',
        serviceName: natGw.name || 'NAT Gateway',
        serviceId: natGw.id || '',
        status: natGw.provisioningState === 'Succeeded' ? 'active' : 'inactive',
        region: natGw.location || '',
        metadata: {
          sku: natGw.sku?.name,
          provisioningState: natGw.provisioningState,
          idleTimeoutInMinutes: natGw.idleTimeoutInMinutes,
          publicIpAddresses: natGw.publicIpAddresses?.length || 0,
          publicIpPrefixes: natGw.publicIpPrefixes?.length || 0,
          subnets: natGw.subnets?.length || 0,
          zones: natGw.zones,
        },
      });
    }
    
    return services;
  } catch (err: any) {
    logger.warn(`NAT Gateway discovery failed: ${err.message}`);
    if (err.statusCode === 403 || err.code === 'AuthorizationFailed') {
      permissionErrors.push({
        serviceType: 'nat_gateway',
        error: err.message,
      });
    }
    return [];
  }
}

// Discover Azure API Management
async function discoverApiManagement(
  credential: any,
  subscriptionId: string,
  permissionErrors: any[]
): Promise<AzureEdgeServiceInfo[]> {
  try {
    const { ApiManagementClient } = await import('@azure/arm-apimanagement');
    const client = new ApiManagementClient(credential, subscriptionId);
    
    const services: AzureEdgeServiceInfo[] = [];
    
    for await (const apim of client.apiManagementService.list()) {
      services.push({
        serviceType: 'api_management',
        serviceName: apim.name || 'API Management',
        serviceId: apim.id || '',
        status: apim.provisioningState === 'Succeeded' ? 'active' : 'inactive',
        region: apim.location || '',
        domainName: apim.gatewayUrl,
        metadata: {
          sku: apim.sku?.name,
          skuCapacity: apim.sku?.capacity,
          provisioningState: apim.provisioningState,
          gatewayUrl: apim.gatewayUrl,
          portalUrl: apim.portalUrl,
          managementApiUrl: apim.managementApiUrl,
          scmUrl: apim.scmUrl,
          developerPortalUrl: apim.developerPortalUrl,
          publicIpAddresses: apim.publicIPAddresses,
          privateIpAddresses: apim.privateIPAddresses,
          virtualNetworkType: apim.virtualNetworkType,
          platformVersion: apim.platformVersion,
        },
      });
    }
    
    return services;
  } catch (err: any) {
    logger.warn(`API Management discovery failed: ${err.message}`);
    if (err.statusCode === 403 || err.code === 'AuthorizationFailed') {
      permissionErrors.push({
        serviceType: 'api_management',
        error: err.message,
      });
    }
    return [];
  }
}


interface AzureEdgeMetricsData {
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

// Collect Azure Monitor metrics for edge services
async function collectAzureMetrics(
  credential: any,
  subscriptionId: string,
  service: AzureEdgeServiceInfo
): Promise<AzureEdgeMetricsData | null> {
  try {
    const { MonitorClient } = await import('@azure/arm-monitor');
    const client = new MonitorClient(credential, subscriptionId);
    
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // 1 hour ago
    const timespan = `${startTime.toISOString()}/${endTime.toISOString()}`;
    
    let metrics: AzureEdgeMetricsData = {
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
    
    const resourceId = service.serviceId;
    
    switch (service.serviceType) {
      case 'front_door':
        metrics = await collectFrontDoorMetrics(client, resourceId, timespan);
        break;
      case 'application_gateway':
        metrics = await collectAppGatewayMetrics(client, resourceId, timespan);
        break;
      case 'load_balancer':
        metrics = await collectLoadBalancerMetrics(client, resourceId, timespan);
        break;
      case 'nat_gateway':
        metrics = await collectNatGatewayMetrics(client, resourceId, timespan);
        break;
      case 'api_management':
        metrics = await collectApiManagementMetrics(client, resourceId, timespan);
        break;
      case 'azure_waf':
        // WAF metrics are collected with the parent service
        break;
    }
    
    return metrics;
  } catch (err) {
    logger.warn(`Failed to collect Azure metrics for ${service.serviceId}: ${err}`);
    return null;
  }
}

// Collect Front Door metrics
async function collectFrontDoorMetrics(
  client: any,
  resourceId: string,
  timespan: string
): Promise<AzureEdgeMetricsData> {
  const metrics: AzureEdgeMetricsData = {
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
  
  try {
    const response = await client.metrics.list(resourceId, {
      timespan,
      interval: 'PT1H',
      metricnames: 'RequestCount,WebApplicationFirewallRequestCount,TotalLatency,BillableResponseSize,BackendHealthPercentage',
      aggregation: 'Total,Average',
    });
    
    for (const metric of response.value || []) {
      const timeseries = metric.timeseries?.[0];
      const data = timeseries?.data || [];
      
      switch (metric.name?.value) {
        case 'RequestCount':
          metrics.requests = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          break;
        case 'WebApplicationFirewallRequestCount':
          metrics.blockedRequests = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          break;
        case 'TotalLatency':
          const avgLatency = data.reduce((sum: number, d: any) => sum + (d.average || 0), 0) / (data.length || 1);
          metrics.responseTime = avgLatency;
          break;
        case 'BillableResponseSize':
          const totalBytes = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          metrics.bandwidthGb = totalBytes / (1024 * 1024 * 1024);
          break;
      }
    }
  } catch (err) {
    logger.warn(`Failed to collect Front Door metrics: ${err}`);
  }
  
  return metrics;
}

// Collect Application Gateway metrics
async function collectAppGatewayMetrics(
  client: any,
  resourceId: string,
  timespan: string
): Promise<AzureEdgeMetricsData> {
  const metrics: AzureEdgeMetricsData = {
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
  
  try {
    const response = await client.metrics.list(resourceId, {
      timespan,
      interval: 'PT1H',
      metricnames: 'TotalRequests,FailedRequests,ResponseStatus,Throughput,ApplicationGatewayTotalTime,BlockedCount',
      aggregation: 'Total,Average',
    });
    
    for (const metric of response.value || []) {
      const timeseries = metric.timeseries?.[0];
      const data = timeseries?.data || [];
      
      switch (metric.name?.value) {
        case 'TotalRequests':
          metrics.requests = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          break;
        case 'FailedRequests':
          metrics.error5xx = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          break;
        case 'BlockedCount':
          metrics.blockedRequests = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          break;
        case 'ApplicationGatewayTotalTime':
          const avgTime = data.reduce((sum: number, d: any) => sum + (d.average || 0), 0) / (data.length || 1);
          metrics.responseTime = avgTime;
          break;
        case 'Throughput':
          const totalBytes = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          metrics.bandwidthGb = totalBytes / (1024 * 1024 * 1024);
          break;
      }
    }
  } catch (err) {
    logger.warn(`Failed to collect Application Gateway metrics: ${err}`);
  }
  
  return metrics;
}


// Collect Load Balancer metrics
async function collectLoadBalancerMetrics(
  client: any,
  resourceId: string,
  timespan: string
): Promise<AzureEdgeMetricsData> {
  const metrics: AzureEdgeMetricsData = {
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
  
  try {
    const response = await client.metrics.list(resourceId, {
      timespan,
      interval: 'PT1H',
      metricnames: 'PacketCount,ByteCount,SnatConnectionCount,AllocatedSnatPorts,UsedSnatPorts',
      aggregation: 'Total,Average',
    });
    
    for (const metric of response.value || []) {
      const timeseries = metric.timeseries?.[0];
      const data = timeseries?.data || [];
      
      switch (metric.name?.value) {
        case 'PacketCount':
          metrics.requests = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          break;
        case 'ByteCount':
          const totalBytes = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          metrics.bandwidthGb = totalBytes / (1024 * 1024 * 1024);
          break;
        case 'SnatConnectionCount':
          // Use SNAT connections as a proxy for active connections
          metrics.cacheHits = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          break;
      }
    }
  } catch (err) {
    logger.warn(`Failed to collect Load Balancer metrics: ${err}`);
  }
  
  return metrics;
}

// Collect NAT Gateway metrics
async function collectNatGatewayMetrics(
  client: any,
  resourceId: string,
  timespan: string
): Promise<AzureEdgeMetricsData> {
  const metrics: AzureEdgeMetricsData = {
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
  
  try {
    const response = await client.metrics.list(resourceId, {
      timespan,
      interval: 'PT1H',
      metricnames: 'TotalConnectionCount,DroppedConnectionCount,ByteCount,PacketCount,SNATConnectionCount',
      aggregation: 'Total,Average',
    });
    
    for (const metric of response.value || []) {
      const timeseries = metric.timeseries?.[0];
      const data = timeseries?.data || [];
      
      switch (metric.name?.value) {
        case 'TotalConnectionCount':
          metrics.requests = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          break;
        case 'DroppedConnectionCount':
          metrics.error5xx = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          break;
        case 'ByteCount':
          const totalBytes = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          metrics.bandwidthGb = totalBytes / (1024 * 1024 * 1024);
          break;
        case 'PacketCount':
          metrics.cacheHits = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          break;
      }
    }
  } catch (err) {
    logger.warn(`Failed to collect NAT Gateway metrics: ${err}`);
  }
  
  return metrics;
}

// Collect API Management metrics
async function collectApiManagementMetrics(
  client: any,
  resourceId: string,
  timespan: string
): Promise<AzureEdgeMetricsData> {
  const metrics: AzureEdgeMetricsData = {
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
  
  try {
    const response = await client.metrics.list(resourceId, {
      timespan,
      interval: 'PT1H',
      metricnames: 'TotalRequests,SuccessfulRequests,UnauthorizedRequests,FailedRequests,OtherRequests,Duration,Capacity',
      aggregation: 'Total,Average',
    });
    
    for (const metric of response.value || []) {
      const timeseries = metric.timeseries?.[0];
      const data = timeseries?.data || [];
      
      switch (metric.name?.value) {
        case 'TotalRequests':
          metrics.requests = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          break;
        case 'SuccessfulRequests':
          metrics.cacheHits = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          break;
        case 'UnauthorizedRequests':
          metrics.error4xx = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          break;
        case 'FailedRequests':
          metrics.error5xx = data.reduce((sum: number, d: any) => sum + (d.total || 0), 0);
          break;
        case 'Duration':
          const avgDuration = data.reduce((sum: number, d: any) => sum + (d.average || 0), 0) / (data.length || 1);
          metrics.responseTime = avgDuration;
          break;
      }
    }
  } catch (err) {
    logger.warn(`Failed to collect API Management metrics: ${err}`);
  }
  
  return metrics;
}


// Upsert Azure edge service in database
async function upsertAzureEdgeService(
  prisma: any,
  organizationId: string,
  accountId: string,
  service: AzureEdgeServiceInfo
): Promise<{ id: string } | null> {
  try {
    const existing = await prisma.edgeService.findFirst({
      where: {
        organization_id: organizationId,
        service_id: service.serviceId,
      },
    });
    
    const data = {
      cloud_provider: 'AZURE',
      azure_credential_id: accountId,
      service_type: service.serviceType,
      service_name: service.serviceName,
      status: service.status,
      region: service.region,
      domain_name: service.domainName,
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
          service_id: service.serviceId,
          ...data,
          created_at: new Date(),
        },
      });
      return { id: created.id };
    }
  } catch (err) {
    logger.warn(`Failed to upsert Azure edge service ${service.serviceId}: ${err}`);
    return null;
  }
}

// Save Azure edge metrics to database
async function saveAzureEdgeMetrics(
  prisma: any,
  organizationId: string,
  accountId: string,
  serviceId: string,
  metrics: AzureEdgeMetricsData
): Promise<void> {
  try {
    // Round timestamp to hour
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
          cloud_provider: 'AZURE',
          azure_credential_id: accountId,
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
    // Ignore duplication errors
    if (!(err as any)?.code?.includes('P2002')) {
      logger.warn(`Failed to save Azure edge metrics: ${err}`);
    }
  }
}

// Update Azure service stats
async function updateAzureServiceStats(
  prisma: any,
  serviceId: string,
  metrics: AzureEdgeMetricsData
): Promise<void> {
  try {
    const totalRequests = metrics.requests || 1;
    const cacheHitRate = totalRequests > 0 ? (metrics.cacheHits / totalRequests) * 100 : 0;
    const errorRate = totalRequests > 0 ? ((metrics.error4xx + metrics.error5xx) / totalRequests) * 100 : 0;
    
    await prisma.edgeService.update({
      where: { id: serviceId },
      data: {
        requests_per_minute: metrics.requests / 60,
        cache_hit_rate: cacheHitRate,
        error_rate: errorRate,
        blocked_requests: metrics.blockedRequests,
        last_updated: new Date(),
      },
    });
  } catch (err) {
    logger.warn(`Failed to update Azure service stats: ${err}`);
  }
}
