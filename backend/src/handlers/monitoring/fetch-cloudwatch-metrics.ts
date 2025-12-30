/**
 * Lambda handler for Fetch CloudWatch Metrics
 * 
 * Coleta TODOS os recursos e métricas usando paralelismo otimizado
 * Sem limites artificiais - o usuário vê tudo
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { withAwsCircuitBreaker } from '../../lib/circuit-breaker.js';
import { getOrigin } from '../../lib/middleware.js';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { ECSClient, ListClustersCommand, ListServicesCommand, DescribeServicesCommand } from '@aws-sdk/client-ecs';
import { ElastiCacheClient, DescribeCacheClustersCommand } from '@aws-sdk/client-elasticache';
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { APIGatewayClient, GetRestApisCommand } from '@aws-sdk/client-api-gateway';
import { randomUUID } from 'crypto';

interface FetchMetricsRequest {
  accountId: string;
  regions?: string[];
  forceRefresh?: boolean;
  period?: '3h' | '24h' | '7d';
}

interface ResourceInfo {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  region: string;
  status: string;
  metadata?: Record<string, any>;
}

interface MetricDataPoint {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  metricName: string;
  value: number;
  timestamp: Date;
  unit: string;
}

// Métricas por tipo de recurso
const METRICS_CONFIG: Record<string, { namespace: string; metrics: string[]; dimensionKey: string }> = {
  ec2: {
    namespace: 'AWS/EC2',
    metrics: ['CPUUtilization', 'NetworkIn', 'NetworkOut', 'DiskReadOps', 'DiskWriteOps'],
    dimensionKey: 'InstanceId',
  },
  rds: {
    namespace: 'AWS/RDS',
    metrics: ['CPUUtilization', 'DatabaseConnections', 'FreeStorageSpace', 'ReadIOPS', 'WriteIOPS'],
    dimensionKey: 'DBInstanceIdentifier',
  },
  lambda: {
    namespace: 'AWS/Lambda',
    metrics: ['Invocations', 'Errors', 'Duration', 'Throttles', 'ConcurrentExecutions'],
    dimensionKey: 'FunctionName',
  },
  ecs: {
    namespace: 'AWS/ECS',
    metrics: ['CPUUtilization', 'MemoryUtilization'],
    dimensionKey: 'ServiceName',
  },
  elasticache: {
    namespace: 'AWS/ElastiCache',
    metrics: ['CPUUtilization', 'NetworkBytesIn', 'NetworkBytesOut', 'CurrConnections'],
    dimensionKey: 'CacheClusterId',
  },
  alb: {
    namespace: 'AWS/ApplicationELB',
    metrics: ['RequestCount', 'TargetResponseTime', 'HTTPCode_Target_2XX_Count'],
    dimensionKey: 'LoadBalancer',
  },
  nlb: {
    namespace: 'AWS/NetworkELB',
    metrics: ['ProcessedBytes', 'ActiveFlowCount', 'NewFlowCount'],
    dimensionKey: 'LoadBalancer',
  },
  apigateway: {
    namespace: 'AWS/ApiGateway',
    metrics: ['Count', 'Latency', '4XXError', '5XXError'],
    dimensionKey: 'ApiName',
  },
};

// Unidades de métricas
const METRIC_UNITS: Record<string, string> = {
  CPUUtilization: 'Percent',
  MemoryUtilization: 'Percent',
  NetworkIn: 'Bytes',
  NetworkOut: 'Bytes',
  NetworkBytesIn: 'Bytes',
  NetworkBytesOut: 'Bytes',
  DiskReadOps: 'Count',
  DiskWriteOps: 'Count',
  DatabaseConnections: 'Count',
  FreeStorageSpace: 'Bytes',
  ReadIOPS: 'Count/Second',
  WriteIOPS: 'Count/Second',
  Invocations: 'Count',
  Errors: 'Count',
  Duration: 'Milliseconds',
  Throttles: 'Count',
  ConcurrentExecutions: 'Count',
  CurrConnections: 'Count',
  RequestCount: 'Count',
  TargetResponseTime: 'Seconds',
  HTTPCode_Target_2XX_Count: 'Count',
  ProcessedBytes: 'Bytes',
  ActiveFlowCount: 'Count',
  NewFlowCount: 'Count',
  Count: 'Count',
  Latency: 'Milliseconds',
  '4XXError': 'Count',
  '5XXError': 'Count',
};

/**
 * Handler principal
 */
async function fetchCloudwatchMetricsHandler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (event.requestContext?.http?.method === 'OPTIONS' || (event as any).httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let user: ReturnType<typeof getUserFromEvent>;
  let organizationId: string;
  
  try {
    user = getUserFromEvent(event);
  } catch (authError) {
    return error('Unauthorized - user not found', 401, undefined, origin);
  }
  
  try {
    organizationId = getOrganizationId(user);
  } catch (orgError) {
    return error('Unauthorized - organization not found', 401, undefined, origin);
  }
  
  const prisma = getPrismaClient();
  const startTime = Date.now();
  
  logger.info('Fetch CloudWatch Metrics started', { organizationId, userId: user.sub });

  try {
    // Parse request body
    let body: FetchMetricsRequest;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return badRequest('Invalid JSON body', undefined, origin);
    }
    
    const { accountId, regions = ['us-east-1'], period = '3h' } = body;
    
    if (!accountId) {
      return badRequest('Missing required parameter: accountId', undefined, origin);
    }
    
    // Buscar credenciais AWS
    const credential = await prisma.awsCredential.findFirst({
      where: {
        id: accountId,
        organization_id: organizationId,
        is_active: true,
      },
    });
    
    if (!credential) {
      return badRequest('AWS credentials not found', undefined, origin);
    }
    
    logger.info('Starting full resource discovery', { 
      accountId: credential.account_name, 
      regions,
      period 
    });
    
    // Descobrir TODOS os recursos em TODAS as regiões em paralelo
    const allResources: ResourceInfo[] = [];
    const allMetrics: MetricDataPoint[] = [];
    const permissionErrors: string[] = [];
    
    // Processar TODAS as regiões em paralelo
    const regionResults = await Promise.allSettled(
      regions.map(async (region) => {
        const regionStart = Date.now();
        const resolvedCreds = await resolveAwsCredentials(credential, region);
        const credentials = toAwsCredentials(resolvedCreds);
        
        // Descobrir TODOS os tipos de recursos em paralelo
        const discoveryResults = await Promise.allSettled([
          discoverEC2(credentials, region),
          discoverRDS(credentials, region),
          discoverLambda(credentials, region),
          discoverECS(credentials, region),
          discoverElastiCache(credentials, region),
          discoverLoadBalancers(credentials, region),
          discoverAPIGateways(credentials, region),
        ]);
        
        const resources: ResourceInfo[] = [];
        for (const result of discoveryResults) {
          if (result.status === 'fulfilled') {
            resources.push(...result.value);
          } else {
            permissionErrors.push(`${region}: ${result.reason?.message || 'Discovery failed'}`);
          }
        }
        
        logger.info(`Region ${region}: discovered ${resources.length} resources in ${Date.now() - regionStart}ms`);
        
        return { region, resources, credentials };
      })
    );
    
    // Coletar recursos de todas as regiões
    const regionData: Array<{ region: string; resources: ResourceInfo[]; credentials: any }> = [];
    for (const result of regionResults) {
      if (result.status === 'fulfilled' && result.value) {
        allResources.push(...result.value.resources);
        regionData.push(result.value);
      }
    }
    
    logger.info(`Total discovered: ${allResources.length} resources across ${regions.length} regions`);
    
    // Coletar métricas de TODOS os recursos em paralelo
    const periodHours = period === '7d' ? 168 : period === '24h' ? 24 : 3;
    
    // Processar métricas por região em paralelo
    const metricsResults = await Promise.allSettled(
      regionData.map(async ({ region, resources, credentials }) => {
        const cwClient = new CloudWatchClient({ region, credentials });
        const regionMetrics: MetricDataPoint[] = [];
        
        // Processar recursos em batches de 10 para não sobrecarregar
        const batches = chunk(resources, 10);
        
        for (const batch of batches) {
          const batchResults = await Promise.allSettled(
            batch.map(async (resource) => {
              const config = METRICS_CONFIG[resource.resourceType];
              if (!config) return [];
              
              const resourceMetrics: MetricDataPoint[] = [];
              
              // Buscar todas as métricas do recurso em paralelo
              const metricResults = await Promise.allSettled(
                config.metrics.map(metricName => 
                  fetchMetric(cwClient, config.namespace, metricName, config.dimensionKey, resource, periodHours)
                )
              );
              
              for (const result of metricResults) {
                if (result.status === 'fulfilled') {
                  resourceMetrics.push(...result.value);
                }
              }
              
              return resourceMetrics;
            })
          );
          
          for (const result of batchResults) {
            if (result.status === 'fulfilled') {
              regionMetrics.push(...result.value);
            }
          }
        }
        
        return regionMetrics;
      })
    );
    
    // Coletar todas as métricas
    for (const result of metricsResults) {
      if (result.status === 'fulfilled') {
        allMetrics.push(...result.value);
      }
    }
    
    logger.info(`Total collected: ${allMetrics.length} metrics`);
    
    // Salvar TODOS os recursos em batch
    if (allResources.length > 0) {
      await saveResourcesBatch(prisma, organizationId, accountId, allResources);
    }
    
    // Salvar TODAS as métricas em batch
    if (allMetrics.length > 0) {
      await saveMetricsBatch(prisma, organizationId, accountId, allMetrics);
    }
    
    const duration = Date.now() - startTime;
    
    logger.info('Fetch CloudWatch Metrics completed', {
      organizationId,
      duration,
      resourcesFound: allResources.length,
      metricsCollected: allMetrics.length,
    });
    
    return success({
      success: true,
      message: `Coletadas ${allMetrics.length} métricas de ${allResources.length} recursos`,
      resourcesFound: allResources.length,
      metricsCollected: allMetrics.length,
      regionsScanned: regions,
      resources: allResources,
      metrics: allMetrics,
      permissionErrors: permissionErrors.length > 0 ? permissionErrors : undefined,
      duration,
    }, 200, origin);
    
  } catch (err) {
    logger.error('Fetch CloudWatch Metrics failed', { 
      error: (err as Error).message, 
      stack: (err as Error).stack 
    });
    return error('Fetch metrics failed: ' + (err as Error).message, 500, undefined, origin);
  }
}

// Utility: dividir array em chunks
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Descobrir EC2
async function discoverEC2(credentials: any, region: string): Promise<ResourceInfo[]> {
  const client = new EC2Client({ region, credentials });
  const resources: ResourceInfo[] = [];
  let nextToken: string | undefined;
  
  do {
    const response = await client.send(new DescribeInstancesCommand({ 
      MaxResults: 100,
      NextToken: nextToken 
    }));
    
    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        const nameTag = instance.Tags?.find(t => t.Key === 'Name');
        resources.push({
          resourceId: instance.InstanceId || '',
          resourceName: nameTag?.Value || instance.InstanceId || '',
          resourceType: 'ec2',
          region,
          status: instance.State?.Name || 'unknown',
          metadata: { instanceType: instance.InstanceType },
        });
      }
    }
    
    nextToken = response.NextToken;
  } while (nextToken);
  
  return resources;
}

// Descobrir RDS
async function discoverRDS(credentials: any, region: string): Promise<ResourceInfo[]> {
  const client = new RDSClient({ region, credentials });
  const resources: ResourceInfo[] = [];
  let marker: string | undefined;
  
  do {
    const response = await client.send(new DescribeDBInstancesCommand({ 
      MaxRecords: 100,
      Marker: marker 
    }));
    
    for (const db of response.DBInstances || []) {
      resources.push({
        resourceId: db.DBInstanceIdentifier || '',
        resourceName: db.DBInstanceIdentifier || '',
        resourceType: 'rds',
        region,
        status: db.DBInstanceStatus || 'unknown',
        metadata: { engine: db.Engine, instanceClass: db.DBInstanceClass },
      });
    }
    
    marker = response.Marker;
  } while (marker);
  
  return resources;
}

// Descobrir Lambda
async function discoverLambda(credentials: any, region: string): Promise<ResourceInfo[]> {
  const client = new LambdaClient({ region, credentials });
  const resources: ResourceInfo[] = [];
  let marker: string | undefined;
  
  do {
    const response = await client.send(new ListFunctionsCommand({ 
      MaxItems: 50,
      Marker: marker 
    }));
    
    for (const fn of response.Functions || []) {
      resources.push({
        resourceId: fn.FunctionName || '',
        resourceName: fn.FunctionName || '',
        resourceType: 'lambda',
        region,
        status: 'active',
        metadata: { runtime: fn.Runtime, memorySize: fn.MemorySize },
      });
    }
    
    marker = response.NextMarker;
  } while (marker);
  
  return resources;
}

// Descobrir ECS
async function discoverECS(credentials: any, region: string): Promise<ResourceInfo[]> {
  const client = new ECSClient({ region, credentials });
  const resources: ResourceInfo[] = [];
  
  const clustersResponse = await client.send(new ListClustersCommand({}));
  
  for (const clusterArn of clustersResponse.clusterArns || []) {
    const servicesResponse = await client.send(new ListServicesCommand({ cluster: clusterArn }));
    
    if (servicesResponse.serviceArns && servicesResponse.serviceArns.length > 0) {
      const describeResponse = await client.send(new DescribeServicesCommand({
        cluster: clusterArn,
        services: servicesResponse.serviceArns,
      }));
      
      for (const service of describeResponse.services || []) {
        resources.push({
          resourceId: service.serviceName || '',
          resourceName: service.serviceName || '',
          resourceType: 'ecs',
          region,
          status: service.status || 'unknown',
          metadata: { clusterArn, desiredCount: service.desiredCount, runningCount: service.runningCount },
        });
      }
    }
  }
  
  return resources;
}

// Descobrir ElastiCache
async function discoverElastiCache(credentials: any, region: string): Promise<ResourceInfo[]> {
  const client = new ElastiCacheClient({ region, credentials });
  const response = await client.send(new DescribeCacheClustersCommand({}));
  
  return (response.CacheClusters || []).map(cluster => ({
    resourceId: cluster.CacheClusterId || '',
    resourceName: cluster.CacheClusterId || '',
    resourceType: 'elasticache',
    region,
    status: cluster.CacheClusterStatus || 'unknown',
    metadata: { engine: cluster.Engine, cacheNodeType: cluster.CacheNodeType },
  }));
}

// Descobrir Load Balancers
async function discoverLoadBalancers(credentials: any, region: string): Promise<ResourceInfo[]> {
  const client = new ElasticLoadBalancingV2Client({ region, credentials });
  const response = await client.send(new DescribeLoadBalancersCommand({}));
  
  return (response.LoadBalancers || []).map(lb => {
    const type = lb.Type === 'application' ? 'alb' : lb.Type === 'network' ? 'nlb' : 'elb';
    const arnParts = lb.LoadBalancerArn?.split(':loadbalancer/') || [];
    const lbDimension = arnParts[1] || lb.LoadBalancerName || '';
    
    return {
      resourceId: lbDimension,
      resourceName: lb.LoadBalancerName || '',
      resourceType: type,
      region,
      status: lb.State?.Code || 'unknown',
      metadata: { dnsName: lb.DNSName, scheme: lb.Scheme },
    };
  });
}

// Descobrir API Gateways
async function discoverAPIGateways(credentials: any, region: string): Promise<ResourceInfo[]> {
  const client = new APIGatewayClient({ region, credentials });
  const response = await client.send(new GetRestApisCommand({}));
  
  return (response.items || []).map(api => ({
    resourceId: api.name || api.id || '',
    resourceName: api.name || '',
    resourceType: 'apigateway',
    region,
    status: 'active',
    metadata: { apiId: api.id, description: api.description },
  }));
}

// Buscar métrica do CloudWatch
async function fetchMetric(
  client: CloudWatchClient,
  namespace: string,
  metricName: string,
  dimensionKey: string,
  resource: ResourceInfo,
  periodHours: number
): Promise<MetricDataPoint[]> {
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - periodHours * 60 * 60 * 1000);
    const aggregationPeriod = periodHours > 24 ? 3600 : periodHours > 3 ? 900 : 300;
    
    const response = await client.send(new GetMetricStatisticsCommand({
      Namespace: namespace,
      MetricName: metricName,
      Dimensions: [{ Name: dimensionKey, Value: resource.resourceId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: aggregationPeriod,
      Statistics: ['Average', 'Sum', 'Maximum'],
    }));
    
    return (response.Datapoints || [])
      .filter(dp => dp.Timestamp && (dp.Average !== undefined || dp.Sum !== undefined))
      .map(dp => ({
        resourceId: resource.resourceId,
        resourceName: resource.resourceName,
        resourceType: resource.resourceType,
        metricName,
        value: dp.Average ?? dp.Sum ?? 0,
        timestamp: dp.Timestamp!,
        unit: METRIC_UNITS[metricName] || 'None',
      }));
  } catch {
    return [];
  }
}

// Salvar recursos em batch
async function saveResourcesBatch(
  prisma: any, 
  organizationId: string, 
  accountId: string, 
  resources: ResourceInfo[]
): Promise<void> {
  if (resources.length === 0) return;
  
  try {
    // Processar em batches de 50 para evitar timeout do Prisma
    const batches = chunk(resources, 50);
    
    for (const batch of batches) {
      await prisma.$transaction(
        batch.map(resource => 
          prisma.monitoredResource.upsert({
            where: {
              organization_id_aws_account_id_resource_id_resource_type: {
                organization_id: organizationId,
                aws_account_id: accountId,
                resource_id: resource.resourceId,
                resource_type: resource.resourceType,
              },
            },
            update: {
              resource_name: resource.resourceName,
              status: resource.status,
              region: resource.region,
              metadata: resource.metadata,
              updated_at: new Date(),
            },
            create: {
              id: randomUUID(),
              organization_id: organizationId,
              aws_account_id: accountId,
              resource_id: resource.resourceId,
              resource_name: resource.resourceName,
              resource_type: resource.resourceType,
              region: resource.region,
              status: resource.status,
              metadata: resource.metadata,
              created_at: new Date(),
              updated_at: new Date(),
            },
          })
        )
      );
    }
    
    logger.info(`Saved ${resources.length} resources to DB`);
  } catch (err) {
    logger.warn('Failed to save resources batch', { error: (err as Error).message });
  }
}

// Salvar métricas em batch
async function saveMetricsBatch(
  prisma: any, 
  organizationId: string, 
  accountId: string, 
  metrics: MetricDataPoint[]
): Promise<void> {
  if (metrics.length === 0) return;
  
  try {
    // Processar em batches de 100 para evitar timeout
    const batches = chunk(metrics, 100);
    
    for (const batch of batches) {
      const data = batch.map(m => ({
        id: randomUUID(),
        organization_id: organizationId,
        aws_account_id: accountId,
        resource_id: m.resourceId,
        resource_name: m.resourceName,
        resource_type: m.resourceType,
        metric_name: m.metricName,
        metric_value: m.value,
        metric_unit: m.unit,
        timestamp: m.timestamp,
        created_at: new Date(),
      }));
      
      await prisma.resourceMetric.createMany({
        data,
        skipDuplicates: true,
      });
    }
    
    logger.info(`Saved ${metrics.length} metrics to DB`);
  } catch (err) {
    logger.warn('Failed to save metrics batch', { error: (err as Error).message });
  }
}

// Export com circuit breaker
export const handler = async (
  event: AuthorizedEvent, 
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> => {
  return withAwsCircuitBreaker('fetch-cloudwatch-metrics', () => 
    fetchCloudwatchMetricsHandler(event, context)
  );
};
