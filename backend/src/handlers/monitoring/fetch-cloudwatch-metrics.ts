import { getHttpMethod } from '../../lib/middleware.js';
/**
 * Lambda handler for Fetch CloudWatch Metrics
 * 
 * Descobre recursos AWS e coleta métricas do CloudWatch automaticamente
 * Suporta: EC2, RDS, Lambda, ECS, ElastiCache, ALB, NLB, API Gateway
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { CloudWatchClient, GetMetricStatisticsCommand, type Statistic, type Dimension } from '@aws-sdk/client-cloudwatch';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { ECSClient, ListClustersCommand, ListServicesCommand, DescribeServicesCommand } from '@aws-sdk/client-ecs';
import { ElastiCacheClient, DescribeCacheClustersCommand } from '@aws-sdk/client-elasticache';
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand, DescribeTargetGroupsCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { APIGatewayClient, GetRestApisCommand } from '@aws-sdk/client-api-gateway';
import { v4 as uuidv4 } from 'uuid';

interface FetchMetricsRequest {
  accountId: string;
  regions?: string[];
}

interface ResourceInfo {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  region: string;
  status: string;
  metadata?: Record<string, any>;
}

interface MetricConfig {
  namespace: string;
  metricName: string;
  dimensions: Dimension[];
  statistics: Statistic[];
}

// Regiões padrão para scan
const DEFAULT_REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'sa-east-1'];

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
    metrics: ['RequestCount', 'TargetResponseTime', 'HTTPCode_Target_2XX_Count', 'HTTPCode_Target_4XX_Count', 'HTTPCode_Target_5XX_Count'],
    dimensionKey: 'LoadBalancer',
  },
  nlb: {
    namespace: 'AWS/NetworkELB',
    metrics: ['ProcessedBytes', 'ActiveFlowCount', 'NewFlowCount', 'ProcessedPackets'],
    dimensionKey: 'LoadBalancer',
  },
  apigateway: {
    namespace: 'AWS/ApiGateway',
    metrics: ['Count', 'Latency', 'IntegrationLatency', '4XXError', '5XXError'],
    dimensionKey: 'ApiName',
  },
};

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Fetch CloudWatch Metrics started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: FetchMetricsRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, regions = DEFAULT_REGIONS } = body;
    
    if (!accountId) {
      return error('Missing required parameter: accountId');
    }
    
    const prisma = getPrismaClient();
    
    // Buscar credenciais AWS
    const account = await prisma.awsCredential.findFirst({
      where: {
        id: accountId,
        organization_id: organizationId,
        is_active: true,
      },
    });
    
    if (!account) {
      return error('AWS account not found or inactive');
    }
    
    logger.info(`📊 Collecting metrics for account ${account.account_name} in regions: ${regions.join(', ')}`);
    
    let totalResources = 0;
    let totalMetrics = 0;
    const permissionErrors: Array<{ resourceType: string; region: string; error: string; missingPermissions: string[] }> = [];
    
    // Processar cada região em paralelo
    const regionResults = await Promise.allSettled(
      regions.map(async (region) => {
        const resolvedCreds = await resolveAwsCredentials(account, region);
        const credentials = toAwsCredentials(resolvedCreds);
        
        // Descobrir recursos em paralelo
        const [ec2Resources, rdsResources, lambdaResources, ecsResources, elasticacheResources, albResources, apiGatewayResources] = await Promise.allSettled([
          discoverEC2Instances(credentials, region, permissionErrors),
          discoverRDSInstances(credentials, region, permissionErrors),
          discoverLambdaFunctions(credentials, region, permissionErrors),
          discoverECSServices(credentials, region, permissionErrors),
          discoverElastiCacheClusters(credentials, region, permissionErrors),
          discoverLoadBalancers(credentials, region, permissionErrors),
          discoverAPIGateways(credentials, region, permissionErrors),
        ]);
        
        const allResources: ResourceInfo[] = [
          ...(ec2Resources.status === 'fulfilled' ? ec2Resources.value : []),
          ...(rdsResources.status === 'fulfilled' ? rdsResources.value : []),
          ...(lambdaResources.status === 'fulfilled' ? lambdaResources.value : []),
          ...(ecsResources.status === 'fulfilled' ? ecsResources.value : []),
          ...(elasticacheResources.status === 'fulfilled' ? elasticacheResources.value : []),
          ...(albResources.status === 'fulfilled' ? albResources.value : []),
          ...(apiGatewayResources.status === 'fulfilled' ? apiGatewayResources.value : []),
        ];
        
        return { region, resources: allResources, credentials };
      })
    );
    
    // Processar resultados e coletar métricas
    for (const result of regionResults) {
      if (result.status !== 'fulfilled') continue;
      
      const { region, resources, credentials } = result.value;
      totalResources += resources.length;
      
      // Salvar recursos no banco
      for (const resource of resources) {
        await upsertResource(prisma, organizationId, accountId, resource);
      }
      
      // Coletar métricas para cada recurso
      const cwClient = new CloudWatchClient({ region, credentials });
      
      for (const resource of resources) {
        const config = METRICS_CONFIG[resource.resourceType];
        if (!config) continue;
        
        for (const metricName of config.metrics) {
          try {
            const datapoints = await fetchMetric(
              cwClient,
              config.namespace,
              metricName,
              [{ Name: config.dimensionKey, Value: resource.resourceId }]
            );
            
            if (datapoints.length > 0) {
              // Salvar métricas no banco
              for (const dp of datapoints) {
                await saveMetric(prisma, organizationId, accountId, resource, metricName, dp);
                totalMetrics++;
              }
            }
          } catch (err) {
            // Ignorar erros de métricas individuais
            logger.warn(`Failed to fetch ${metricName} for ${resource.resourceId}: ${err}`);
          }
        }
      }
    }
    
    logger.info(`✅ Collected ${totalMetrics} metrics from ${totalResources} resources`);
    
    return success({
      success: true,
      message: `Coletadas ${totalMetrics} métricas de ${totalResources} recursos`,
      resourcesFound: totalResources,
      metricsCollected: totalMetrics,
      regionsScanned: regions,
      permissionErrors: permissionErrors.length > 0 ? permissionErrors : undefined,
    });
    
  } catch (err) {
    logger.error('❌ Fetch CloudWatch Metrics error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

// Descobrir instâncias EC2
async function discoverEC2Instances(
  credentials: any,
  region: string,
  permissionErrors: any[]
): Promise<ResourceInfo[]> {
  try {
    const client = new EC2Client({ region, credentials });
    const response = await client.send(new DescribeInstancesCommand({}));
    
    const resources: ResourceInfo[] = [];
    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        const nameTag = instance.Tags?.find(t => t.Key === 'Name');
        resources.push({
          resourceId: instance.InstanceId || '',
          resourceName: nameTag?.Value || instance.InstanceId || '',
          resourceType: 'ec2',
          region,
          status: instance.State?.Name || 'unknown',
          metadata: {
            instanceType: instance.InstanceType,
            privateIp: instance.PrivateIpAddress,
            publicIp: instance.PublicIpAddress,
          },
        });
      }
    }
    return resources;
  } catch (err: any) {
    logger.warn(`EC2 discovery failed in ${region}: ${err.message}`);
    if (err.name === 'AccessDeniedException' || err.Code === 'UnauthorizedOperation') {
      permissionErrors.push({
        resourceType: 'ec2',
        region,
        error: err.message,
        missingPermissions: ['ec2:DescribeInstances'],
      });
    }
    return [];
  }
}

// Descobrir instâncias RDS
async function discoverRDSInstances(
  credentials: any,
  region: string,
  permissionErrors: any[]
): Promise<ResourceInfo[]> {
  try {
    const client = new RDSClient({ region, credentials });
    const response = await client.send(new DescribeDBInstancesCommand({}));
    
    return (response.DBInstances || []).map(db => ({
      resourceId: db.DBInstanceIdentifier || '',
      resourceName: db.DBInstanceIdentifier || '',
      resourceType: 'rds',
      region,
      status: db.DBInstanceStatus || 'unknown',
      metadata: {
        engine: db.Engine,
        engineVersion: db.EngineVersion,
        instanceClass: db.DBInstanceClass,
      },
    }));
  } catch (err: any) {
    logger.warn(`RDS discovery failed in ${region}: ${err.message}`);
    if (err.name === 'AccessDeniedException') {
      permissionErrors.push({
        resourceType: 'rds',
        region,
        error: err.message,
        missingPermissions: ['rds:DescribeDBInstances'],
      });
    }
    return [];
  }
}

// Descobrir funções Lambda
async function discoverLambdaFunctions(
  credentials: any,
  region: string,
  permissionErrors: any[]
): Promise<ResourceInfo[]> {
  try {
    const client = new LambdaClient({ region, credentials });
    const response = await client.send(new ListFunctionsCommand({}));
    
    return (response.Functions || []).map(fn => ({
      resourceId: fn.FunctionName || '',
      resourceName: fn.FunctionName || '',
      resourceType: 'lambda',
      region,
      status: 'active',
      metadata: {
        runtime: fn.Runtime,
        memorySize: fn.MemorySize,
        timeout: fn.Timeout,
      },
    }));
  } catch (err: any) {
    logger.warn(`Lambda discovery failed in ${region}: ${err.message}`);
    if (err.name === 'AccessDeniedException') {
      permissionErrors.push({
        resourceType: 'lambda',
        region,
        error: err.message,
        missingPermissions: ['lambda:ListFunctions'],
      });
    }
    return [];
  }
}

// Descobrir serviços ECS
async function discoverECSServices(
  credentials: any,
  region: string,
  permissionErrors: any[]
): Promise<ResourceInfo[]> {
  try {
    const client = new ECSClient({ region, credentials });
    const clustersResponse = await client.send(new ListClustersCommand({}));
    
    const resources: ResourceInfo[] = [];
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
            metadata: {
              clusterArn,
              desiredCount: service.desiredCount,
              runningCount: service.runningCount,
            },
          });
        }
      }
    }
    return resources;
  } catch (err: any) {
    logger.warn(`ECS discovery failed in ${region}: ${err.message}`);
    if (err.name === 'AccessDeniedException') {
      permissionErrors.push({
        resourceType: 'ecs',
        region,
        error: err.message,
        missingPermissions: ['ecs:ListClusters', 'ecs:ListServices', 'ecs:DescribeServices'],
      });
    }
    return [];
  }
}

// Descobrir clusters ElastiCache
async function discoverElastiCacheClusters(
  credentials: any,
  region: string,
  permissionErrors: any[]
): Promise<ResourceInfo[]> {
  try {
    const client = new ElastiCacheClient({ region, credentials });
    const response = await client.send(new DescribeCacheClustersCommand({}));
    
    return (response.CacheClusters || []).map(cluster => ({
      resourceId: cluster.CacheClusterId || '',
      resourceName: cluster.CacheClusterId || '',
      resourceType: 'elasticache',
      region,
      status: cluster.CacheClusterStatus || 'unknown',
      metadata: {
        engine: cluster.Engine,
        engineVersion: cluster.EngineVersion,
        cacheNodeType: cluster.CacheNodeType,
      },
    }));
  } catch (err: any) {
    logger.warn(`ElastiCache discovery failed in ${region}: ${err.message}`);
    if (err.name === 'AccessDeniedException') {
      permissionErrors.push({
        resourceType: 'elasticache',
        region,
        error: err.message,
        missingPermissions: ['elasticache:DescribeCacheClusters'],
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
): Promise<ResourceInfo[]> {
  try {
    const client = new ElasticLoadBalancingV2Client({ region, credentials });
    const response = await client.send(new DescribeLoadBalancersCommand({}));
    
    return (response.LoadBalancers || []).map(lb => {
      const type = lb.Type === 'application' ? 'alb' : lb.Type === 'network' ? 'nlb' : 'elb';
      // Extract the LoadBalancer dimension value from ARN
      // Format: arn:aws:elasticloadbalancing:region:account:loadbalancer/app/name/id
      const arnParts = lb.LoadBalancerArn?.split(':loadbalancer/') || [];
      const lbDimension = arnParts[1] || lb.LoadBalancerName || '';
      
      return {
        resourceId: lbDimension,
        resourceName: lb.LoadBalancerName || '',
        resourceType: type,
        region,
        status: lb.State?.Code || 'unknown',
        metadata: {
          dnsName: lb.DNSName,
          scheme: lb.Scheme,
          vpcId: lb.VpcId,
          arn: lb.LoadBalancerArn,
        },
      };
    });
  } catch (err: any) {
    logger.warn(`ELB discovery failed in ${region}: ${err.message}`);
    if (err.name === 'AccessDeniedException') {
      permissionErrors.push({
        resourceType: 'alb/nlb',
        region,
        error: err.message,
        missingPermissions: ['elasticloadbalancing:DescribeLoadBalancers'],
      });
    }
    return [];
  }
}

// Descobrir API Gateways
async function discoverAPIGateways(
  credentials: any,
  region: string,
  permissionErrors: any[]
): Promise<ResourceInfo[]> {
  try {
    const client = new APIGatewayClient({ region, credentials });
    const response = await client.send(new GetRestApisCommand({}));
    
    return (response.items || []).map(api => ({
      resourceId: api.name || api.id || '',
      resourceName: api.name || '',
      resourceType: 'apigateway',
      region,
      status: 'active',
      metadata: {
        apiId: api.id,
        description: api.description,
        createdDate: api.createdDate?.toISOString(),
      },
    }));
  } catch (err: any) {
    logger.warn(`API Gateway discovery failed in ${region}: ${err.message}`);
    if (err.name === 'AccessDeniedException') {
      permissionErrors.push({
        resourceType: 'apigateway',
        region,
        error: err.message,
        missingPermissions: ['apigateway:GET'],
      });
    }
    return [];
  }
}

// Buscar métrica do CloudWatch
async function fetchMetric(
  client: CloudWatchClient,
  namespace: string,
  metricName: string,
  dimensions: Dimension[]
): Promise<Array<{ timestamp: Date; value: number }>> {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 3 * 60 * 60 * 1000); // 3 hours ago
  
  const response = await client.send(new GetMetricStatisticsCommand({
    Namespace: namespace,
    MetricName: metricName,
    Dimensions: dimensions,
    StartTime: startTime,
    EndTime: endTime,
    Period: 300, // 5 minutes
    Statistics: ['Average', 'Sum', 'Maximum'],
  }));
  
  return (response.Datapoints || [])
    .filter(dp => dp.Timestamp && (dp.Average !== undefined || dp.Sum !== undefined))
    .map(dp => ({
      timestamp: dp.Timestamp!,
      value: dp.Average ?? dp.Sum ?? 0,
      maximum: dp.Maximum,
      sum: dp.Sum,
    }));
}

// Upsert recurso no banco
async function upsertResource(
  prisma: any,
  organizationId: string,
  accountId: string,
  resource: ResourceInfo
): Promise<void> {
  try {
    const existing = await prisma.monitoredResource.findFirst({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
        resource_id: resource.resourceId,
        resource_type: resource.resourceType,
      },
    });
    
    if (existing) {
      await prisma.monitoredResource.update({
        where: { id: existing.id },
        data: {
          resource_name: resource.resourceName,
          status: resource.status,
          region: resource.region,
          metadata: resource.metadata,
          updated_at: new Date(),
        },
      });
    } else {
      await prisma.monitoredResource.create({
        data: {
          id: uuidv4(),
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
      });
    }
  } catch (err) {
    logger.warn(`Failed to upsert resource ${resource.resourceId}: ${err}`);
  }
}

// Salvar métrica no banco
async function saveMetric(
  prisma: any,
  organizationId: string,
  accountId: string,
  resource: ResourceInfo,
  metricName: string,
  datapoint: { timestamp: Date; value: number; maximum?: number; sum?: number }
): Promise<void> {
  try {
    // Check if metric already exists for this timestamp
    const existing = await prisma.resourceMetric.findFirst({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
        resource_id: resource.resourceId,
        metric_name: metricName,
        timestamp: datapoint.timestamp,
      },
    });
    
    if (!existing) {
      await prisma.resourceMetric.create({
        data: {
          id: uuidv4(),
          organization_id: organizationId,
          aws_account_id: accountId,
          resource_id: resource.resourceId,
          resource_name: resource.resourceName,
          resource_type: resource.resourceType,
          metric_name: metricName,
          metric_value: datapoint.value,
          metric_unit: getMetricUnit(metricName),
          timestamp: datapoint.timestamp,
          created_at: new Date(),
        },
      });
    }
  } catch (err) {
    // Ignore duplicate key errors
    if (!(err as any)?.code?.includes('P2002')) {
      logger.warn(`Failed to save metric ${metricName} for ${resource.resourceId}: ${err}`);
    }
  }
}

// Obter unidade da métrica
function getMetricUnit(metricName: string): string {
  const units: Record<string, string> = {
    CPUUtilization: 'Percent',
    MemoryUtilization: 'Percent',
    NetworkIn: 'Bytes',
    NetworkOut: 'Bytes',
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
    RequestCount: 'Count',
    TargetResponseTime: 'Seconds',
    ProcessedBytes: 'Bytes',
    ActiveFlowCount: 'Count',
    NewFlowCount: 'Count',
    ProcessedPackets: 'Count',
    Count: 'Count',
    Latency: 'Milliseconds',
    IntegrationLatency: 'Milliseconds',
    '4XXError': 'Count',
    '5XXError': 'Count',
    NetworkBytesIn: 'Bytes',
    NetworkBytesOut: 'Bytes',
    CurrConnections: 'Count',
  };
  return units[metricName] || 'None';
}
