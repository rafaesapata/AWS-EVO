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
  // Auth & MFA
  if (lambdaName.includes('mfa') || lambdaName.includes('webauthn') || lambdaName.includes('verify-tv-token')) return 'auth';
  
  // Admin
  if (lambdaName.includes('admin') || lambdaName.includes('cognito-user') || lambdaName.includes('manage-organizations')) return 'admin';
  
  // Security (includes validate-aws-credentials, validate-permissions, etc.)
  if (lambdaName.includes('security') || lambdaName.includes('compliance') || lambdaName.includes('waf') ||
      lambdaName.includes('validate-aws') || lambdaName.includes('validate-permission') ||
      lambdaName.includes('guardduty') || lambdaName.includes('well-architected') ||
      lambdaName.includes('iam-deep') || lambdaName.includes('lateral-movement') ||
      lambdaName.includes('drift-detection') || lambdaName.includes('cloudtrail') ||
      lambdaName.includes('findings') || lambdaName.includes('posture')) return 'security';
  
  // Cost & FinOps
  if (lambdaName.includes('cost') || lambdaName.includes('ri-sp') || lambdaName.includes('finops') ||
      lambdaName.includes('budget') || lambdaName.includes('forecast') || lambdaName.includes('waste')) return 'cost';
  
  // Azure Multi-Cloud
  if (lambdaName.includes('azure')) return 'azure';
  
  // AI & ML
  if (lambdaName.includes('bedrock') || lambdaName.includes('ai-') || lambdaName.includes('-ai') ||
      lambdaName.includes('predict') || lambdaName.includes('anomal') || lambdaName.includes('intelligent')) return 'ai';
  
  // Dashboard & Monitoring (includes platform monitoring lambdas)
  if (lambdaName.includes('dashboard') || lambdaName.includes('alert') || lambdaName.includes('monitor') ||
      lambdaName.includes('metric') || lambdaName.includes('error-fix') || lambdaName.includes('recent-errors') ||
      lambdaName.includes('lambda-health') || lambdaName.includes('platform-metrics') ||
      lambdaName.includes('edge-services') || lambdaName.includes('endpoint-monitor') ||
      lambdaName.includes('realtime')) return 'monitoring';
  
  // License
  if (lambdaName.includes('license') || lambdaName.includes('seats')) return 'license';
  
  // Knowledge Base
  if (lambdaName.includes('kb-') || lambdaName.includes('article')) return 'knowledge-base';
  
  // Reports
  if (lambdaName.includes('report') || lambdaName.includes('pdf') || lambdaName.includes('excel') ||
      lambdaName.includes('remediation')) return 'reports';
  
  // Organizations & Profiles
  if (lambdaName.includes('organization') || lambdaName.includes('profile')) return 'organizations';
  
  // Notifications
  if (lambdaName.includes('email') || lambdaName.includes('notification') || lambdaName.includes('communication')) return 'notifications';
  
  // Storage
  if (lambdaName.includes('storage') || lambdaName.includes('attachment') || lambdaName.includes('upload')) return 'storage';
  
  // Jobs
  if (lambdaName.includes('job') || lambdaName.includes('scheduled')) return 'jobs';
  
  // AWS Credentials (onboarding)
  if (lambdaName.includes('aws-credentials') || lambdaName.includes('save-aws') || 
      lambdaName.includes('list-aws') || lambdaName.includes('update-aws') ||
      lambdaName.includes('cloud-credentials')) return 'onboarding';
  
  // Data operations
  if (lambdaName.includes('query-table') || lambdaName.includes('mutate-table')) return 'data';
  
  // Integrations
  if (lambdaName.includes('jira') || lambdaName.includes('integration')) return 'integrations';
  
  // Log audit
  if (lambdaName.includes('log-audit') || lambdaName.includes('audit')) return 'admin';
  
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
