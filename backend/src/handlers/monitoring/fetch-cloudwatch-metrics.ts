/**
 * Lambda handler for Fetch CloudWatch Metrics
 * 
 * Coleta TODOS os recursos e métricas usando paralelismo otimizado
 * Sem limites artificiais - o usuário vê tudo
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { withAwsCircuitBreaker } from '../../lib/circuit-breaker.js';
import { getOrigin } from '../../lib/middleware.js';
import { CloudWatchClient, GetMetricStatisticsCommand, Statistic } from '@aws-sdk/client-cloudwatch';
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
const METRICS_CONFIG: Record<string, { namespace: string; metrics: string[]; dimensionKey: string; requiresStage?: boolean }> = {
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
    metrics: ['Count', 'Latency', 'IntegrationLatency', '4XXError', '5XXError'],
    dimensionKey: 'ApiName',
    requiresStage: true, // API Gateway metrics require Stage dimension
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
  IntegrationLatency: 'Milliseconds',
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
    organizationId = getOrganizationIdWithImpersonation(event, user);
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
    
    const { accountId, regions: requestedRegions, period = '3h' } = body;
    
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
    
    // Usar regiões da credencial se disponíveis, senão usar as solicitadas ou padrão
    const credentialRegions = credential.regions as string[] | null;
    const regions = requestedRegions || 
                    (credentialRegions && credentialRegions.length > 0 ? credentialRegions : ['us-east-1']);
    
    logger.info('Starting full resource discovery', { 
      accountId: credential.account_name, 
      regions,
      credentialRegions,
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
        const discoveryFunctions = [
          { name: 'EC2', fn: () => discoverEC2(credentials, region) },
          { name: 'RDS', fn: () => discoverRDS(credentials, region) },
          { name: 'Lambda', fn: () => discoverLambda(credentials, region) },
          { name: 'ECS', fn: () => discoverECS(credentials, region) },
          { name: 'ElastiCache', fn: () => discoverElastiCache(credentials, region) },
          { name: 'LoadBalancers', fn: () => discoverLoadBalancers(credentials, region) },
          { name: 'APIGateway', fn: () => discoverAPIGateways(credentials, region) },
        ];
        
        const discoveryResults = await Promise.allSettled(
          discoveryFunctions.map(d => d.fn())
        );
        
        const resources: ResourceInfo[] = [];
        discoveryResults.forEach((result, index) => {
          const serviceName = discoveryFunctions[index].name;
          if (result.status === 'fulfilled') {
            logger.info(`${region}/${serviceName}: found ${result.value.length} resources`);
            resources.push(...result.value);
          } else {
            const errorMsg = result.reason?.message || 'Discovery failed';
            logger.warn(`${region}/${serviceName}: FAILED - ${errorMsg}`);
            permissionErrors.push(`${region}/${serviceName}: ${errorMsg}`);
          }
        });
        
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
              if (!config) {
                logger.warn(`No metrics config for resource type: ${resource.resourceType}`);
                return [];
              }
              
              const resourceMetrics: MetricDataPoint[] = [];
              
              // Buscar todas as métricas do recurso em paralelo
              const metricResults = await Promise.allSettled(
                config.metrics.map(metricName => 
                  fetchMetric(cwClient, config.namespace, metricName, config.dimensionKey, resource, periodHours, config.requiresStage)
                )
              );
              
              for (const [index, result] of metricResults.entries()) {
                const metricName = config.metrics[index];
                if (result.status === 'fulfilled') {
                  resourceMetrics.push(...result.value);
                  if (result.value.length > 0) {
                    logger.debug(`Collected ${result.value.length} datapoints for ${resource.resourceType}:${resource.resourceId}:${metricName}`);
                  }
                } else {
                  logger.warn(`Failed to fetch metric ${metricName} for ${resource.resourceType}:${resource.resourceId}`, {
                    error: result.reason?.message || 'Unknown error'
                  });
                }
              }
              
              return resourceMetrics;
            })
          );
          
          for (const [index, result] of batchResults.entries()) {
            const resource = batch[index];
            if (result.status === 'fulfilled') {
              regionMetrics.push(...result.value);
              if (result.value.length > 0) {
                logger.debug(`Resource ${resource.resourceType}:${resource.resourceId} contributed ${result.value.length} metrics`);
              } else {
                logger.warn(`Resource ${resource.resourceType}:${resource.resourceId} contributed 0 metrics`);
              }
            } else {
              logger.error(`Failed to process metrics for resource ${resource.resourceType}:${resource.resourceId}`, {
                error: result.reason?.message || 'Unknown error'
              });
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
  
  try {
    do {
      const response = await client.send(new ListFunctionsCommand({ 
        MaxItems: 50,
        Marker: marker 
      }));
      
      for (const fn of response.Functions || []) {
        // Validar que temos dados essenciais
        if (!fn.FunctionName) {
          logger.warn(`Lambda function without name found in ${region}`, { functionArn: fn.FunctionArn });
          continue;
        }
        
        resources.push({
          resourceId: fn.FunctionName,
          resourceName: fn.FunctionName,
          resourceType: 'lambda',
          region,
          status: fn.State === 'Active' ? 'active' : (fn.State || 'unknown').toLowerCase(),
          metadata: { 
            runtime: fn.Runtime, 
            memorySize: fn.MemorySize,
            timeout: fn.Timeout,
            lastModified: fn.LastModified,
            functionArn: fn.FunctionArn
          },
        });
      }
      
      marker = response.NextMarker;
    } while (marker);
    
    logger.info(`Discovered ${resources.length} Lambda functions in ${region}`);
    return resources;
  } catch (error) {
    logger.error(`Failed to discover Lambda functions in ${region}`, {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    throw error; // Re-throw para que o erro seja capturado no nível superior
  }
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
  periodHours: number,
  requiresStage?: boolean
): Promise<MetricDataPoint[]> {
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - periodHours * 60 * 60 * 1000);
    const aggregationPeriod = periodHours > 24 ? 3600 : periodHours > 3 ? 900 : 300;
    
    // Métricas de contagem que devem usar Sum
    const countMetrics = new Set([
      'Count', '4XXError', '5XXError', 'Invocations', 'Errors', 'Throttles',
      'RequestCount', 'HTTPCode_Target_2XX_Count', 'HTTPCode_Target_4XX_Count', 'HTTPCode_Target_5XX_Count'
    ]);
    
    // Determinar estatísticas baseado no tipo de métrica
    let statistics: Statistic[] = ['Average', 'Sum', 'Maximum'];
    const isCountMetric = countMetrics.has(metricName);
    
    if (resource.resourceType === 'lambda') {
      if (['Invocations', 'Errors', 'Throttles'].includes(metricName)) {
        statistics = ['Sum'];
      } else if (metricName === 'Duration') {
        statistics = ['Average', 'Maximum'];
      } else if (metricName === 'ConcurrentExecutions') {
        statistics = ['Maximum'];
      }
    } else if (resource.resourceType === 'apigateway') {
      // Para API Gateway, usar Sum para contagens e Average para latências
      if (isCountMetric) {
        statistics = ['Sum'];
      } else {
        statistics = ['Average'];
      }
    }
    
    // Construir dimensões
    const dimensions: Array<{ Name: string; Value: string }> = [
      { Name: dimensionKey, Value: resource.resourceId }
    ];
    
    // API Gateway requer dimensão Stage para métricas funcionarem
    if (requiresStage && resource.resourceType === 'apigateway') {
      // Tentar buscar com stage 'prod' primeiro (mais comum)
      const stages = ['prod', 'production', 'dev', 'staging'];
      
      for (const stage of stages) {
        const stageResponse = await client.send(new GetMetricStatisticsCommand({
          Namespace: namespace,
          MetricName: metricName,
          Dimensions: [
            { Name: dimensionKey, Value: resource.resourceId },
            { Name: 'Stage', Value: stage }
          ],
          StartTime: startTime,
          EndTime: endTime,
          Period: aggregationPeriod,
          Statistics: statistics,
        }));
        
        if (stageResponse.Datapoints && stageResponse.Datapoints.length > 0) {
          logger.debug(`Found ${stageResponse.Datapoints.length} datapoints for ${resource.resourceId} with stage ${stage}`);
          
          return (stageResponse.Datapoints || [])
            .filter(dp => dp.Timestamp && (dp.Average !== undefined || dp.Sum !== undefined || dp.Maximum !== undefined))
            .map(dp => ({
              resourceId: resource.resourceId,
              resourceName: resource.resourceName,
              resourceType: resource.resourceType,
              metricName,
              value: isCountMetric ? (dp.Sum ?? 0) : (dp.Average ?? dp.Sum ?? dp.Maximum ?? 0),
              timestamp: dp.Timestamp!,
              unit: METRIC_UNITS[metricName] || 'None',
            }));
        }
      }
      
      // Se nenhum stage funcionou, tentar sem stage (fallback)
      logger.debug(`No data found with Stage dimension for ${resource.resourceId}, trying without Stage`);
    }
    
    logger.debug(`Fetching ${metricName} for ${resource.resourceType}:${resource.resourceId}`, {
      namespace,
      dimensionKey,
      statistics,
      period: aggregationPeriod
    });
    
    const response = await client.send(new GetMetricStatisticsCommand({
      Namespace: namespace,
      MetricName: metricName,
      Dimensions: dimensions,
      StartTime: startTime,
      EndTime: endTime,
      Period: aggregationPeriod,
      Statistics: statistics,
    }));
    
    const datapoints = (response.Datapoints || [])
      .filter(dp => dp.Timestamp && (dp.Average !== undefined || dp.Sum !== undefined || dp.Maximum !== undefined))
      .map(dp => {
        // Escolher o valor correto baseado no tipo de métrica
        let value = 0;
        
        if (isCountMetric) {
          // Métricas de contagem sempre usam Sum
          value = dp.Sum ?? 0;
        } else if (resource.resourceType === 'lambda') {
          if (metricName === 'Duration') {
            value = dp.Average ?? 0;
          } else if (metricName === 'ConcurrentExecutions') {
            value = dp.Maximum ?? 0;
          } else {
            value = dp.Average ?? dp.Sum ?? dp.Maximum ?? 0;
          }
        } else {
          // Para latências e outras métricas, usar Average
          value = dp.Average ?? dp.Sum ?? dp.Maximum ?? 0;
        }
        
        return {
          resourceId: resource.resourceId,
          resourceName: resource.resourceName,
          resourceType: resource.resourceType,
          metricName,
          value,
          timestamp: dp.Timestamp!,
          unit: METRIC_UNITS[metricName] || 'None',
        };
      });
    
    if (datapoints.length > 0) {
      logger.debug(`Found ${datapoints.length} datapoints for ${resource.resourceType}:${resource.resourceId}:${metricName}`);
    } else {
      logger.warn(`No datapoints found for ${resource.resourceType}:${resource.resourceId}:${metricName}`, {
        namespace,
        dimensionKey,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      });
    }
    
    return datapoints;
  } catch (error) {
    logger.error(`Failed to fetch metric ${metricName} for ${resource.resourceType}:${resource.resourceId}`, {
      error: (error as Error).message,
      namespace,
      dimensionKey
    });
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
