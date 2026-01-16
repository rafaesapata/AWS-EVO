/**
 * CloudWatch Batch Metrics Fetcher
 * 
 * Optimized fetching of CloudWatch metrics using:
 * - GetMetricData API for batch queries (up to 500 metrics per call)
 * - Concurrency control to avoid throttling
 * - Caching to reduce API calls
 */

import { 
  CloudWatchClient, 
  GetMetricDataCommand,
  MetricDataQuery,
  MetricDataResult 
} from '@aws-sdk/client-cloudwatch';
import { metricsCache } from './metrics-cache.js';
import { logger } from './logging.js';

const cloudwatch = new CloudWatchClient({ region: 'us-east-1' });

// Concurrency limiter
class ConcurrencyLimiter {
  private running = 0;
  private queue: (() => void)[] = [];

  constructor(private maxConcurrent: number = 5) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

const limiter = new ConcurrencyLimiter(5);

export interface LambdaMetricResult {
  lambdaName: string;
  errors: number;
  invocations: number;
  avgDuration: number;
  maxDuration: number;
  p95Duration: number;
  category: string;
}

/**
 * Fetch metrics for multiple Lambdas in batches
 * Uses GetMetricData API which is more efficient than GetMetricStatistics
 */
export async function fetchLambdaMetricsBatch(
  lambdaNames: string[],
  startTime: Date,
  endTime: Date,
  prefix: string = 'evo-uds-v3-production-'
): Promise<LambdaMetricResult[]> {
  const cacheKey = `lambda-metrics:${startTime.getTime()}:${endTime.getTime()}`;
  
  // Try cache first
  const cached = metricsCache.get<LambdaMetricResult[]>(cacheKey);
  if (cached) {
    logger.info('Using cached lambda metrics', { count: cached.length });
    return cached;
  }

  const results: LambdaMetricResult[] = [];
  
  // Split into batches of 100 (CloudWatch limit is 500 queries, but we query 3 metrics per Lambda)
  const batchSize = 100;
  const batches: string[][] = [];
  
  for (let i = 0; i < lambdaNames.length; i += batchSize) {
    batches.push(lambdaNames.slice(i, i + batchSize));
  }

  logger.info('Fetching lambda metrics in batches', { 
    totalLambdas: lambdaNames.length, 
    batches: batches.length 
  });

  // Process batches with concurrency control
  const batchPromises = batches.map(async (batch, batchIndex) => {
    await limiter.acquire();
    
    try {
      const batchResults = await fetchBatch(batch, startTime, endTime, prefix);
      return batchResults;
    } finally {
      limiter.release();
    }
  });

  const batchResults = await Promise.all(batchPromises);
  
  for (const batchResult of batchResults) {
    results.push(...batchResult);
  }

  // Cache for 60 seconds
  metricsCache.set(cacheKey, results, 60000);

  logger.info('Lambda metrics fetched', { count: results.length });
  return results;
}

async function fetchBatch(
  lambdaNames: string[],
  startTime: Date,
  endTime: Date,
  prefix: string
): Promise<LambdaMetricResult[]> {
  const queries: MetricDataQuery[] = [];
  
  // Build queries for each Lambda (Errors, Invocations, Duration)
  lambdaNames.forEach((name, idx) => {
    const fullName = `${prefix}${name}`;
    const safeId = name.replace(/-/g, '_');
    
    // Errors
    queries.push({
      Id: `errors_${safeId}`,
      MetricStat: {
        Metric: {
          Namespace: 'AWS/Lambda',
          MetricName: 'Errors',
          Dimensions: [{ Name: 'FunctionName', Value: fullName }],
        },
        Period: 3600,
        Stat: 'Sum',
      },
      ReturnData: true,
    });

    // Invocations
    queries.push({
      Id: `invocations_${safeId}`,
      MetricStat: {
        Metric: {
          Namespace: 'AWS/Lambda',
          MetricName: 'Invocations',
          Dimensions: [{ Name: 'FunctionName', Value: fullName }],
        },
        Period: 3600,
        Stat: 'Sum',
      },
      ReturnData: true,
    });

    // Duration (Average)
    queries.push({
      Id: `duration_${safeId}`,
      MetricStat: {
        Metric: {
          Namespace: 'AWS/Lambda',
          MetricName: 'Duration',
          Dimensions: [{ Name: 'FunctionName', Value: fullName }],
        },
        Period: 3600,
        Stat: 'Average',
      },
      ReturnData: true,
    });
  });

  try {
    const command = new GetMetricDataCommand({
      MetricDataQueries: queries,
      StartTime: startTime,
      EndTime: endTime,
    });

    const response = await cloudwatch.send(command);
    
    // Parse results
    const metricsMap = new Map<string, Partial<LambdaMetricResult>>();
    
    for (const result of response.MetricDataResults || []) {
      if (!result.Id || !result.Values) continue;
      
      const [metricType, ...nameParts] = result.Id.split('_');
      const lambdaName = nameParts.join('-');
      
      if (!metricsMap.has(lambdaName)) {
        metricsMap.set(lambdaName, {
          lambdaName: `${prefix}${lambdaName}`,
          errors: 0,
          invocations: 0,
          avgDuration: 0,
          maxDuration: 0,
          p95Duration: 0,
          category: getCategoryFromLambdaName(lambdaName),
        });
      }
      
      const metric = metricsMap.get(lambdaName)!;
      const sum = result.Values.reduce((a, b) => a + b, 0);
      
      switch (metricType) {
        case 'errors':
          metric.errors = sum;
          break;
        case 'invocations':
          metric.invocations = sum;
          break;
        case 'duration':
          metric.avgDuration = Math.round(sum / Math.max(result.Values.length, 1));
          metric.p95Duration = Math.round(metric.avgDuration * 1.5); // Estimate
          break;
      }
    }
    
    return Array.from(metricsMap.values()) as LambdaMetricResult[];
  } catch (err) {
    logger.error('Error fetching batch metrics', err as Error);
    return [];
  }
}

function getCategoryFromLambdaName(lambdaName: string): string {
  if (lambdaName.includes('mfa') || lambdaName.includes('webauthn')) return 'auth';
  if (lambdaName.includes('admin')) return 'admin';
  if (lambdaName.includes('security') || lambdaName.includes('compliance') || lambdaName.includes('waf')) return 'security';
  if (lambdaName.includes('cost') || lambdaName.includes('ri-sp') || lambdaName.includes('finops')) return 'cost';
  if (lambdaName.includes('azure')) return 'azure';
  if (lambdaName.includes('bedrock') || lambdaName.includes('ai') || lambdaName.includes('ml')) return 'ai';
  if (lambdaName.includes('dashboard') || lambdaName.includes('alert') || lambdaName.includes('monitor')) return 'monitoring';
  if (lambdaName.includes('license')) return 'license';
  if (lambdaName.includes('kb-')) return 'knowledge-base';
  if (lambdaName.includes('report') || lambdaName.includes('pdf') || lambdaName.includes('excel')) return 'reports';
  if (lambdaName.includes('organization')) return 'organizations';
  if (lambdaName.includes('email') || lambdaName.includes('notification')) return 'notifications';
  if (lambdaName.includes('storage')) return 'storage';
  if (lambdaName.includes('job')) return 'jobs';
  return 'other';
}

/**
 * Fetch API Gateway metrics in batch
 */
export async function fetchApiGatewayMetrics(
  startTime: Date,
  endTime: Date,
  apiName: string = 'evo-uds-v3-production-api'
): Promise<{ total5xx: number; total4xx: number }> {
  const cacheKey = `apigw-metrics:${startTime.getTime()}:${endTime.getTime()}`;
  
  const cached = metricsCache.get<{ total5xx: number; total4xx: number }>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const command = new GetMetricDataCommand({
      MetricDataQueries: [
        {
          Id: 'errors_5xx',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ApiGateway',
              MetricName: '5XXError',
              Dimensions: [{ Name: 'ApiName', Value: apiName }],
            },
            Period: 3600,
            Stat: 'Sum',
          },
          ReturnData: true,
        },
        {
          Id: 'errors_4xx',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ApiGateway',
              MetricName: '4XXError',
              Dimensions: [{ Name: 'ApiName', Value: apiName }],
            },
            Period: 3600,
            Stat: 'Sum',
          },
          ReturnData: true,
        },
      ],
      StartTime: startTime,
      EndTime: endTime,
    });

    const response = await cloudwatch.send(command);
    
    let total5xx = 0;
    let total4xx = 0;
    
    for (const result of response.MetricDataResults || []) {
      const sum = result.Values?.reduce((a, b) => a + b, 0) || 0;
      if (result.Id === 'errors_5xx') total5xx = sum;
      if (result.Id === 'errors_4xx') total4xx = sum;
    }

    const metrics = { total5xx, total4xx };
    metricsCache.set(cacheKey, metrics, 60000);
    
    return metrics;
  } catch (err) {
    logger.error('Error fetching API Gateway metrics', err as Error);
    return { total5xx: 0, total4xx: 0 };
  }
}
