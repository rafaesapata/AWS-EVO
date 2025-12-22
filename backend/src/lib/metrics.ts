/**
 * CloudWatch Custom Metrics Implementation
 * Provides business metrics and operational insights
 */

import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { logger } from './logging.js';

const cloudwatch = new CloudWatchClient({});
const NAMESPACE = 'EVO-UDS';

export async function publishMetric(
  name: string,
  value: number,
  unit: 'Count' | 'Milliseconds' | 'Bytes' | 'Percent' | 'Seconds',
  dimensions?: Record<string, string>
) {
  try {
    await cloudwatch.send(new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: [{
        MetricName: name,
        Value: value,
        Unit: unit,
        Dimensions: dimensions ? 
          Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value })) : 
          undefined,
        Timestamp: new Date(),
      }],
    }));
  } catch (error) {
    logger.error('Failed to publish metric', error as Error, { name, value, unit });
  }
}

// Métricas de negócio
export const businessMetrics = {
  async securityScanCompleted(duration: number, findingsCount: number, orgId: string, scanType: string) {
    await Promise.all([
      publishMetric('SecurityScanDuration', duration, 'Milliseconds', { 
        OrgId: orgId, 
        ScanType: scanType 
      }),
      publishMetric('FindingsCount', findingsCount, 'Count', { 
        OrgId: orgId, 
        ScanType: scanType 
      }),
      publishMetric('SecurityScansCompleted', 1, 'Count', { 
        OrgId: orgId, 
        ScanType: scanType 
      }),
    ]);
  },

  async costAnalysisCompleted(totalCost: number, savingsIdentified: number, orgId: string) {
    await Promise.all([
      publishMetric('TotalCostAnalyzed', totalCost, 'Count', { OrgId: orgId }),
      publishMetric('SavingsIdentified', savingsIdentified, 'Count', { OrgId: orgId }),
      publishMetric('CostAnalysisCompleted', 1, 'Count', { OrgId: orgId }),
    ]);
  },

  async aiRequestLatency(duration: number, model: string, requestType: string) {
    await Promise.all([
      publishMetric('AIRequestLatency', duration, 'Milliseconds', { 
        Model: model, 
        RequestType: requestType 
      }),
      publishMetric('AIRequestsCount', 1, 'Count', { 
        Model: model, 
        RequestType: requestType 
      }),
    ]);
  },

  async userActivity(action: string, orgId: string, userId: string) {
    await publishMetric('UserActivity', 1, 'Count', {
      Action: action,
      OrgId: orgId,
      UserId: userId,
    });
  },

  async errorOccurred(errorType: string, handler: string, orgId?: string) {
    await publishMetric('ErrorsCount', 1, 'Count', {
      ErrorType: errorType,
      Handler: handler,
      OrgId: orgId || 'unknown',
    });
  },

  async databaseQuery(duration: number, queryType: string, success: boolean) {
    await Promise.all([
      publishMetric('DatabaseQueryDuration', duration, 'Milliseconds', { 
        QueryType: queryType,
        Success: success.toString(),
      }),
      publishMetric('DatabaseQueriesCount', 1, 'Count', { 
        QueryType: queryType,
        Success: success.toString(),
      }),
    ]);
  },

  async awsApiCall(service: string, operation: string, duration: number, success: boolean) {
    await Promise.all([
      publishMetric('AWSAPICallDuration', duration, 'Milliseconds', {
        Service: service,
        Operation: operation,
        Success: success.toString(),
      }),
      publishMetric('AWSAPICallsCount', 1, 'Count', {
        Service: service,
        Operation: operation,
        Success: success.toString(),
      }),
    ]);
  },
};

// Métricas operacionais
export const operationalMetrics = {
  async lambdaColdStart(functionName: string, duration: number) {
    await publishMetric('ColdStartDuration', duration, 'Milliseconds', {
      FunctionName: functionName,
    });
  },

  async memoryUtilization(functionName: string, memoryUsed: number, memoryAllocated: number) {
    const utilizationPercent = (memoryUsed / memoryAllocated) * 100;
    await publishMetric('MemoryUtilization', utilizationPercent, 'Percent', {
      FunctionName: functionName,
    });
  },

  async rateLimitHit(endpoint: string, orgId: string) {
    await publishMetric('RateLimitHits', 1, 'Count', {
      Endpoint: endpoint,
      OrgId: orgId,
    });
  },

  async cacheHit(cacheType: string, hit: boolean) {
    await publishMetric('CacheOperations', 1, 'Count', {
      CacheType: cacheType,
      Result: hit ? 'hit' : 'miss',
    });
  },
};

// Wrapper para medir duração automaticamente
export function withMetrics<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  metricName: string,
  dimensions?: Record<string, string>
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    let success = true;
    
    try {
      const result = await fn(...args);
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await publishMetric(metricName, duration, 'Milliseconds', {
        ...dimensions,
        Success: success.toString(),
      });
    }
  }) as T;
}