/**
 * Lambda handler for Fetch CloudWatch Metrics
 * AWS Lambda Handler for fetch-cloudwatch-metrics
 * 
 * Busca métricas do CloudWatch para recursos AWS
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { CloudWatchClient, GetMetricStatisticsCommand, type Statistic } from '@aws-sdk/client-cloudwatch';

interface FetchMetricsRequest {
  accountId: string;
  region: string;
  namespace: string;
  metricName: string;
  dimensions?: Array<{ Name: string; Value: string }>;
  startTime?: string;
  endTime?: string;
  period?: number; // seconds
  statistics?: Statistic[]; // ['Average', 'Sum', 'Maximum', etc.]
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Fetch CloudWatch Metrics started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: FetchMetricsRequest = event.body ? JSON.parse(event.body) : {};
    const {
      accountId,
      region,
      namespace,
      metricName,
      dimensions = [],
      startTime = getTimeAgo(24), // 24 hours ago
      endTime = new Date().toISOString(),
      period = 3600, // 1 hour
      statistics = ['Average' as Statistic],
    } = body;
    
    if (!accountId || !region || !namespace || !metricName) {
      return error('Missing required parameters: accountId, region, namespace, metricName');
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
    
    // Resolver credenciais
    const resolvedCreds = await resolveAwsCredentials(account, region);
    
    const cwClient = new CloudWatchClient({
      region,
      credentials: toAwsCredentials(resolvedCreds),
    });
    
    const command = new GetMetricStatisticsCommand({
      Namespace: namespace,
      MetricName: metricName,
      Dimensions: dimensions,
      StartTime: new Date(startTime),
      EndTime: new Date(endTime),
      Period: period,
      Statistics: statistics,
    });
    
    const response = await cwClient.send(command);
    
    // Processar datapoints
    const datapoints = (response.Datapoints || [])
      .sort((a, b) => (a.Timestamp?.getTime() || 0) - (b.Timestamp?.getTime() || 0))
      .map(dp => ({
        timestamp: dp.Timestamp?.toISOString(),
        average: dp.Average,
        sum: dp.Sum,
        maximum: dp.Maximum,
        minimum: dp.Minimum,
        sampleCount: dp.SampleCount,
        unit: dp.Unit,
      }));
    
    logger.info(`✅ Fetched ${datapoints.length} datapoints for ${namespace}/${metricName}`);
    
    return success({
      success: true,
      metric: {
        namespace,
        metricName,
        dimensions,
      },
      datapoints,
      summary: {
        count: datapoints.length,
        period,
        startTime,
        endTime,
      },
    });
    
  } catch (err) {
    logger.error('❌ Fetch CloudWatch Metrics error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

function getTimeAgo(hours: number): string {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}
