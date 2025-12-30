/**
 * Handler para testar especificamente a coleta de métricas das Lambdas
 * Usado para debug e validação
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { getOrigin } from '../../lib/middleware.js';
import { CloudWatchClient, GetMetricStatisticsCommand, ListMetricsCommand, Statistic } from '@aws-sdk/client-cloudwatch';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';

interface TestLambdaMetricsRequest {
  accountId: string;
  region?: string;
  functionName?: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions(origin);
  }

  let user: ReturnType<typeof getUserFromEvent>;
  let organizationId: string;
  
  try {
    user = getUserFromEvent(event);
    organizationId = getOrganizationId(user);
  } catch (authError) {
    return error('Unauthorized', 401, undefined, origin);
  }
  
  const prisma = getPrismaClient();
  
  try {
    const body: TestLambdaMetricsRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, region = 'us-east-1', functionName } = body;
    
    if (!accountId) {
      return error('Missing accountId', 400, undefined, origin);
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
      return error('AWS credentials not found', 404, undefined, origin);
    }
    
    const resolvedCreds = await resolveAwsCredentials(credential, region);
    const credentials = toAwsCredentials(resolvedCreds);
    
    const lambdaClient = new LambdaClient({ region, credentials });
    const cwClient = new CloudWatchClient({ region, credentials });
    
    const results: any = {
      region,
      accountId,
      functionName,
      lambdaFunctions: [],
      availableMetrics: [],
      metricData: [],
      errors: []
    };
    
    try {
      // 1. Listar funções Lambda
      logger.info('Listing Lambda functions...');
      const functionsResponse = await lambdaClient.send(new ListFunctionsCommand({ MaxItems: 10 }));
      
      results.lambdaFunctions = (functionsResponse.Functions || []).map(fn => ({
        functionName: fn.FunctionName,
        runtime: fn.Runtime,
        state: fn.State,
        lastModified: fn.LastModified,
        memorySize: fn.MemorySize,
        timeout: fn.Timeout
      }));
      
      logger.info(`Found ${results.lambdaFunctions.length} Lambda functions`);
      
      // 2. Se uma função específica foi solicitada, usar ela; senão usar a primeira
      const targetFunction = functionName || results.lambdaFunctions[0]?.functionName;
      
      if (!targetFunction) {
        return success({
          message: 'No Lambda functions found in this region',
          ...results
        }, 200, origin);
      }
      
      results.targetFunction = targetFunction;
      
      // 3. Listar métricas disponíveis para esta função
      logger.info(`Listing available metrics for function: ${targetFunction}`);
      const metricsResponse = await cwClient.send(new ListMetricsCommand({
        Namespace: 'AWS/Lambda',
        Dimensions: [{ Name: 'FunctionName', Value: targetFunction }]
      }));
      
      results.availableMetrics = (metricsResponse.Metrics || []).map(m => ({
        metricName: m.MetricName,
        dimensions: m.Dimensions,
        namespace: m.Namespace
      }));
      
      logger.info(`Found ${results.availableMetrics.length} available metrics`);
      
      // 4. Buscar dados das métricas principais
      const metricsToTest = ['Invocations', 'Duration', 'Errors', 'Throttles', 'ConcurrentExecutions'];
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Últimas 24h
      
      for (const metricName of metricsToTest) {
        try {
          logger.info(`Fetching ${metricName} for ${targetFunction}`);
          
          // Usar estatísticas apropriadas para cada métrica
          let statistics: Statistic[] = ['Average'];
          if (['Invocations', 'Errors', 'Throttles'].includes(metricName)) {
            statistics = ['Sum'];
          } else if (metricName === 'ConcurrentExecutions') {
            statistics = ['Maximum'];
          }
          
          const metricResponse = await cwClient.send(new GetMetricStatisticsCommand({
            Namespace: 'AWS/Lambda',
            MetricName: metricName,
            Dimensions: [{ Name: 'FunctionName', Value: targetFunction }],
            StartTime: startTime,
            EndTime: endTime,
            Period: 3600, // 1 hora
            Statistics: statistics
          }));
          
          const datapoints = (metricResponse.Datapoints || []).map(dp => ({
            timestamp: dp.Timestamp,
            value: dp.Sum ?? dp.Average ?? dp.Maximum ?? 0,
            unit: dp.Unit
          }));
          
          results.metricData.push({
            metricName,
            statistics,
            datapointsCount: datapoints.length,
            datapoints: datapoints.slice(0, 5), // Primeiros 5 pontos para debug
            hasData: datapoints.length > 0
          });
          
          logger.info(`${metricName}: ${datapoints.length} datapoints`);
          
        } catch (metricError) {
          const errorMsg = (metricError as Error).message;
          logger.error(`Failed to fetch ${metricName}:`, errorMsg);
          results.errors.push(`${metricName}: ${errorMsg}`);
        }
      }
      
      // 5. Verificar dados no banco
      const dbResources = await prisma.monitoredResource.findMany({
        where: {
          organization_id: organizationId,
          aws_account_id: accountId,
          resource_type: 'lambda',
          resource_id: targetFunction
        }
      });
      
      const dbMetrics = await prisma.resourceMetric.findMany({
        where: {
          organization_id: organizationId,
          aws_account_id: accountId,
          resource_type: 'lambda',
          resource_id: targetFunction
        },
        orderBy: { timestamp: 'desc' },
        take: 10
      });
      
      results.database = {
        resourcesFound: dbResources.length,
        metricsFound: dbMetrics.length,
        latestMetrics: dbMetrics.map(m => ({
          metricName: m.metric_name,
          value: m.metric_value,
          timestamp: m.timestamp,
          unit: m.metric_unit
        }))
      };
      
      return success({
        message: `Lambda metrics test completed for ${targetFunction}`,
        ...results
      }, 200, origin);
      
    } catch (testError) {
      const errorMsg = (testError as Error).message;
      logger.error('Lambda metrics test failed:', errorMsg);
      results.errors.push(`Test failed: ${errorMsg}`);
      
      return success({
        message: 'Lambda metrics test completed with errors',
        ...results
      }, 200, origin);
    }
    
  } catch (err) {
    logger.error('Test Lambda metrics handler failed:', (err as Error).message);
    return error('Test failed: ' + (err as Error).message, 500, undefined, origin);
  }
}