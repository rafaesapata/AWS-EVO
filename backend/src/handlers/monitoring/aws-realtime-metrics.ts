import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for AWS Realtime Metrics
 * AWS Lambda Handler for aws-realtime-metrics
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { isOrganizationInDemoMode, generateDemoRealtimeMetrics } from '../../lib/demo-data-service.js';

interface RealtimeMetricsRequest {
  accountId: string;
  region?: string;
  resources?: Array<{ type: string; id: string }>;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationIdWithImpersonation(event, user);
  
  logger.info('AWS Realtime Metrics started', { 
    organizationId,
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  try {
    const body: RealtimeMetricsRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, region: requestedRegion, resources = [] } = body;
    
    if (!accountId) {
      return error('Missing required parameter: accountId');
    }
    
    const prisma = getPrismaClient();
    
    // ============================================
    // DEMO MODE CHECK - Return demo data if enabled
    // ============================================
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    if (isDemo === true) {
      logger.info('Returning demo realtime metrics data', { organizationId, isDemo: true });
      const demoData = generateDemoRealtimeMetrics();
      return success(demoData);
    }
    
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return error('AWS account not found');
    }
    
    // Usar região solicitada, ou primeira região da conta, ou padrão
    const accountRegions = account.regions as string[] | null;
    const region = requestedRegion || 
                   (accountRegions && accountRegions.length > 0 ? accountRegions[0] : 'us-east-1');
    
    const resolvedCreds = await resolveAwsCredentials(account, region);
    
    const cwClient = new CloudWatchClient({
      region,
      credentials: toAwsCredentials(resolvedCreds),
    });
    
    const metrics: any[] = [];
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    // Se não especificou recursos, buscar métricas gerais
    if (resources.length === 0) {
      resources.push(
        { type: 'EC2', id: 'all' },
        { type: 'RDS', id: 'all' },
        { type: 'Lambda', id: 'all' }
      );
    }
    
    for (const resource of resources) {
      try {
        let metricData;
        
        switch (resource.type) {
          case 'EC2':
            metricData = await getEC2Metrics(cwClient, resource.id, fiveMinutesAgo, now);
            break;
          case 'RDS':
            metricData = await getRDSMetrics(cwClient, resource.id, fiveMinutesAgo, now);
            break;
          case 'Lambda':
            metricData = await getLambdaMetrics(cwClient, resource.id, fiveMinutesAgo, now);
            break;
          default:
            continue;
        }
        
        metrics.push({
          resourceType: resource.type,
          resourceId: resource.id,
          metrics: metricData,
          timestamp: now.toISOString(),
        });
        
      } catch (err) {
        logger.error('Error fetching metrics for resource', err as Error, { 
          organizationId, 
          resourceType: resource.type, 
          resourceId: resource.id 
        });
      }
    }
    
    logger.info('Realtime metrics fetched successfully', { 
      organizationId, 
      accountId, 
      region,
      resourcesCount: metrics.length 
    });
    
    return success({
      success: true,
      metrics,
      timestamp: now.toISOString(),
    });
    
  } catch (err) {
    logger.error('AWS Realtime Metrics error', err as Error, { 
      organizationId,
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

async function getEC2Metrics(client: CloudWatchClient, instanceId: string, start: Date, end: Date) {
  const command = new GetMetricStatisticsCommand({
    Namespace: 'AWS/EC2',
    MetricName: 'CPUUtilization',
    ...(instanceId !== 'all' && {
      Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
    }),
    StartTime: start,
    EndTime: end,
    Period: 60,
    Statistics: ['Average', 'Maximum'],
  });
  
  const response = await client.send(command);
  const latest = response.Datapoints?.[response.Datapoints.length - 1];
  
  return {
    cpuUtilization: latest?.Average || 0,
    cpuMax: latest?.Maximum || 0,
  };
}

async function getRDSMetrics(client: CloudWatchClient, dbId: string, start: Date, end: Date) {
  const command = new GetMetricStatisticsCommand({
    Namespace: 'AWS/RDS',
    MetricName: 'CPUUtilization',
    ...(dbId !== 'all' && {
      Dimensions: [{ Name: 'DBInstanceIdentifier', Value: dbId }],
    }),
    StartTime: start,
    EndTime: end,
    Period: 60,
    Statistics: ['Average'],
  });
  
  const response = await client.send(command);
  const latest = response.Datapoints?.[response.Datapoints.length - 1];
  
  return {
    cpuUtilization: latest?.Average || 0,
  };
}

async function getLambdaMetrics(client: CloudWatchClient, functionName: string, start: Date, end: Date) {
  const command = new GetMetricStatisticsCommand({
    Namespace: 'AWS/Lambda',
    MetricName: 'Invocations',
    ...(functionName !== 'all' && {
      Dimensions: [{ Name: 'FunctionName', Value: functionName }],
    }),
    StartTime: start,
    EndTime: end,
    Period: 60,
    Statistics: ['Sum'],
  });
  
  const response = await client.send(command);
  const latest = response.Datapoints?.[response.Datapoints.length - 1];
  
  return {
    invocations: latest?.Sum || 0,
  };
}
