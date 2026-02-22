import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for AWS Realtime Metrics
 * AWS Lambda Handler for aws-realtime-metrics
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, safeHandler } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logger.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { realtimeMetricsSchema } from '../../lib/schemas.js';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { isOrganizationInDemoMode, generateDemoRealtimeMetrics } from '../../lib/demo-data-service.js';
import { z } from 'zod';

// Extended schema for realtime metrics with resources
const awsRealtimeMetricsSchema = z.object({
  accountId: z.string().uuid().optional(),
  region: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/).optional(),
  resources: z.array(z.object({
    type: z.string().min(1),
    id: z.string().min(1),
  })).optional(),
});

export const handler = safeHandler(async (
  event: AuthorizedEvent,
  context: LambdaContext
) => {
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
    const prisma = getPrismaClient();
    
    // ============================================
    // DEMO MODE CHECK - Return demo data if enabled
    // Check BEFORE accountId validation for demo mode
    // ============================================
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    if (isDemo === true) {
      logger.info('Returning demo realtime metrics data', { organizationId, isDemo: true });
      const demoData = generateDemoRealtimeMetrics();
      return success(demoData);
    }
    
    // Validate input with Zod
    const validation = parseAndValidateBody(awsRealtimeMetricsSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { accountId, region: requestedRegion, resources = [] } = validation.data;
    
    if (!accountId) {
      return error('Missing required parameter: accountId', 400);
    }
    
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return error('AWS account not found', 404);
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
    return error('An unexpected error occurred. Please try again.', 500);
  }
});

async function getEC2Metrics(client: CloudWatchClient, instanceId: string, start: Date, end: Date) {
  const metrics: Record<string, number> = {};
  
  const metricNames = [
    { name: 'CPUUtilization', stats: ['Average', 'Maximum'] },
    { name: 'NetworkIn', stats: ['Sum'] },
    { name: 'NetworkOut', stats: ['Sum'] },
    { name: 'DiskReadOps', stats: ['Sum'] },
    { name: 'DiskWriteOps', stats: ['Sum'] },
    { name: 'StatusCheckFailed', stats: ['Maximum'] },
  ];

  const results = await Promise.allSettled(
    metricNames.map(async ({ name, stats }) => {
      const command = new GetMetricStatisticsCommand({
        Namespace: 'AWS/EC2',
        MetricName: name,
        ...(instanceId !== 'all' && {
          Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
        }),
        StartTime: start,
        EndTime: end,
        Period: 60,
        Statistics: stats as any[],
      });
      const response = await client.send(command);
      const sorted = (response.Datapoints || []).sort((a, b) => 
        (b.Timestamp?.getTime() || 0) - (a.Timestamp?.getTime() || 0)
      );
      return { name, datapoint: sorted[0] };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.datapoint) {
      const dp = result.value.datapoint;
      const name = result.value.name;
      if (name === 'CPUUtilization') {
        metrics.cpuUtilization = dp.Average || 0;
        metrics.cpuMax = dp.Maximum || 0;
      } else if (name === 'NetworkIn') {
        metrics.networkInBytes = dp.Sum || 0;
      } else if (name === 'NetworkOut') {
        metrics.networkOutBytes = dp.Sum || 0;
      } else if (name === 'StatusCheckFailed') {
        metrics.statusCheckFailed = dp.Maximum || 0;
      }
    }
  }

  return metrics;
}

async function getRDSMetrics(client: CloudWatchClient, dbId: string, start: Date, end: Date) {
  const metrics: Record<string, number> = {};

  const metricNames = [
    { name: 'CPUUtilization', stats: ['Average'] },
    { name: 'FreeableMemory', stats: ['Average'] },
    { name: 'DatabaseConnections', stats: ['Average'] },
    { name: 'ReadIOPS', stats: ['Average'] },
    { name: 'WriteIOPS', stats: ['Average'] },
    { name: 'FreeStorageSpace', stats: ['Average'] },
  ];

  const results = await Promise.allSettled(
    metricNames.map(async ({ name, stats }) => {
      const command = new GetMetricStatisticsCommand({
        Namespace: 'AWS/RDS',
        MetricName: name,
        ...(dbId !== 'all' && {
          Dimensions: [{ Name: 'DBInstanceIdentifier', Value: dbId }],
        }),
        StartTime: start,
        EndTime: end,
        Period: 60,
        Statistics: stats as any[],
      });
      const response = await client.send(command);
      const sorted = (response.Datapoints || []).sort((a, b) => 
        (b.Timestamp?.getTime() || 0) - (a.Timestamp?.getTime() || 0)
      );
      return { name, datapoint: sorted[0] };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.datapoint) {
      const dp = result.value.datapoint;
      const name = result.value.name;
      if (name === 'CPUUtilization') metrics.cpuUtilization = dp.Average || 0;
      else if (name === 'FreeableMemory') metrics.freeableMemoryMB = Math.round((dp.Average || 0) / 1024 / 1024);
      else if (name === 'DatabaseConnections') metrics.connections = dp.Average || 0;
      else if (name === 'ReadIOPS') metrics.readIOPS = dp.Average || 0;
      else if (name === 'WriteIOPS') metrics.writeIOPS = dp.Average || 0;
      else if (name === 'FreeStorageSpace') metrics.freeStorageGB = Math.round((dp.Average || 0) / 1024 / 1024 / 1024 * 100) / 100;
    }
  }

  return metrics;
}

async function getLambdaMetrics(client: CloudWatchClient, functionName: string, start: Date, end: Date) {
  const metrics: Record<string, number> = {};

  const metricNames = [
    { name: 'Invocations', stats: ['Sum'] },
    { name: 'Errors', stats: ['Sum'] },
    { name: 'Duration', stats: ['Average', 'Maximum'] },
    { name: 'Throttles', stats: ['Sum'] },
    { name: 'ConcurrentExecutions', stats: ['Maximum'] },
  ];

  const results = await Promise.allSettled(
    metricNames.map(async ({ name, stats }) => {
      const command = new GetMetricStatisticsCommand({
        Namespace: 'AWS/Lambda',
        MetricName: name,
        ...(functionName !== 'all' && {
          Dimensions: [{ Name: 'FunctionName', Value: functionName }],
        }),
        StartTime: start,
        EndTime: end,
        Period: 60,
        Statistics: stats as any[],
      });
      const response = await client.send(command);
      const sorted = (response.Datapoints || []).sort((a, b) => 
        (b.Timestamp?.getTime() || 0) - (a.Timestamp?.getTime() || 0)
      );
      return { name, datapoint: sorted[0] };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.datapoint) {
      const dp = result.value.datapoint;
      const name = result.value.name;
      if (name === 'Invocations') metrics.invocations = dp.Sum || 0;
      else if (name === 'Errors') metrics.errors = dp.Sum || 0;
      else if (name === 'Duration') {
        metrics.avgDuration = dp.Average || 0;
        metrics.maxDuration = dp.Maximum || 0;
      }
      else if (name === 'Throttles') metrics.throttles = dp.Sum || 0;
      else if (name === 'ConcurrentExecutions') metrics.concurrentExecutions = dp.Maximum || 0;
    }
  }

  metrics.errorRate = metrics.invocations > 0 ? Math.round((metrics.errors / metrics.invocations) * 10000) / 100 : 0;

  return metrics;
}
