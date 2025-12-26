# ML-Powered Waste Detection 3.0 - Technical Design

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ML Waste Detection 3.0                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   Frontend   │───▶│  API Gateway │───▶│   Lambda     │                   │
│  │   React/TS   │    │   REST API   │    │   Handler    │                   │
│  └──────────────┘    └──────────────┘    └──────┬───────┘                   │
│                                                  │                           │
│                                    ┌─────────────┴─────────────┐            │
│                                    ▼                           ▼            │
│                          ┌──────────────────┐      ┌──────────────────┐     │
│                          │ Parallel Executor│      │  Pricing Service │     │
│                          └────────┬─────────┘      └──────────────────┘     │
│                                   │                                          │
│         ┌─────────────────────────┼─────────────────────────┐               │
│         ▼                         ▼                         ▼               │
│  ┌─────────────┐          ┌─────────────┐          ┌─────────────┐         │
│  │ EC2 Analyzer│          │ S3 Analyzer │          │ RDS Analyzer│         │
│  └─────────────┘          └─────────────┘          └─────────────┘         │
│  ┌─────────────┐          ┌─────────────┐          ┌─────────────┐         │
│  │ EBS Analyzer│          │ NAT Analyzer│          │ DDB Analyzer│         │
│  └─────────────┘          └─────────────┘          └─────────────┘         │
│         │                         │                         │               │
│         └─────────────────────────┼─────────────────────────┘               │
│                                   ▼                                          │
│                          ┌──────────────────┐                               │
│                          │   ML Models      │                               │
│                          │ ┌──────────────┐ │                               │
│                          │ │  Forecaster  │ │                               │
│                          │ ├──────────────┤ │                               │
│                          │ │  Anomaly Det │ │                               │
│                          │ ├──────────────┤ │                               │
│                          │ │ Seasonality  │ │                               │
│                          │ ├──────────────┤ │                               │
│                          │ │Risk Classifier│ │                               │
│                          │ └──────────────┘ │                               │
│                          └────────┬─────────┘                               │
│                                   ▼                                          │
│                          ┌──────────────────┐                               │
│                          │   PostgreSQL     │                               │
│                          │   (RDS/Prisma)   │                               │
│                          └──────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. ARN Builder Module

### File: `backend/src/lib/ml-analysis/arn-builder.ts`

```typescript
/**
 * ARN Builder Module
 * 
 * Builds Amazon Resource Names (ARNs) for all supported AWS services.
 * ARN format: arn:partition:service:region:account-id:resource-type/resource-id
 */

export interface ArnComponents {
  service: string;
  region: string;
  accountId: string;
  resourceType?: string;
  resourceId: string;
}

// ARN format templates for each service
const ARN_FORMATS: Record<string, (c: ArnComponents) => string> = {
  // Compute
  'ec2:instance': (c) => `arn:aws:ec2:${c.region}:${c.accountId}:instance/${c.resourceId}`,
  'ec2:volume': (c) => `arn:aws:ec2:${c.region}:${c.accountId}:volume/${c.resourceId}`,
  'ec2:snapshot': (c) => `arn:aws:ec2:${c.region}:${c.accountId}:snapshot/${c.resourceId}`,
  'ec2:elastic-ip': (c) => `arn:aws:ec2:${c.region}:${c.accountId}:elastic-ip/${c.resourceId}`,
  'ec2:nat-gateway': (c) => `arn:aws:ec2:${c.region}:${c.accountId}:natgateway/${c.resourceId}`,
  'ec2:network-interface': (c) => `arn:aws:ec2:${c.region}:${c.accountId}:network-interface/${c.resourceId}`,
  'lambda:function': (c) => `arn:aws:lambda:${c.region}:${c.accountId}:function:${c.resourceId}`,
  'ecs:cluster': (c) => `arn:aws:ecs:${c.region}:${c.accountId}:cluster/${c.resourceId}`,
  'ecs:service': (c) => `arn:aws:ecs:${c.region}:${c.accountId}:service/${c.resourceId}`,
  'ecs:task': (c) => `arn:aws:ecs:${c.region}:${c.accountId}:task/${c.resourceId}`,
  'eks:cluster': (c) => `arn:aws:eks:${c.region}:${c.accountId}:cluster/${c.resourceId}`,
  'batch:job-queue': (c) => `arn:aws:batch:${c.region}:${c.accountId}:job-queue/${c.resourceId}`,
  
  // Storage
  's3:bucket': (c) => `arn:aws:s3:::${c.resourceId}`,
  'efs:file-system': (c) => `arn:aws:elasticfilesystem:${c.region}:${c.accountId}:file-system/${c.resourceId}`,
  'fsx:file-system': (c) => `arn:aws:fsx:${c.region}:${c.accountId}:file-system/${c.resourceId}`,
  'glacier:vault': (c) => `arn:aws:glacier:${c.region}:${c.accountId}:vaults/${c.resourceId}`,
  
  // Database
  'rds:db': (c) => `arn:aws:rds:${c.region}:${c.accountId}:db:${c.resourceId}`,
  'rds:cluster': (c) => `arn:aws:rds:${c.region}:${c.accountId}:cluster:${c.resourceId}`,
  'dynamodb:table': (c) => `arn:aws:dynamodb:${c.region}:${c.accountId}:table/${c.resourceId}`,
  'elasticache:cluster': (c) => `arn:aws:elasticache:${c.region}:${c.accountId}:cluster:${c.resourceId}`,
  'elasticache:replication-group': (c) => `arn:aws:elasticache:${c.region}:${c.accountId}:replicationgroup:${c.resourceId}`,
  'redshift:cluster': (c) => `arn:aws:redshift:${c.region}:${c.accountId}:cluster:${c.resourceId}`,
  'neptune:cluster': (c) => `arn:aws:neptune:${c.region}:${c.accountId}:cluster:${c.resourceId}`,
  'opensearch:domain': (c) => `arn:aws:es:${c.region}:${c.accountId}:domain/${c.resourceId}`,
  
  // Network
  'elb:loadbalancer': (c) => `arn:aws:elasticloadbalancing:${c.region}:${c.accountId}:loadbalancer/${c.resourceId}`,
  'elbv2:loadbalancer': (c) => `arn:aws:elasticloadbalancing:${c.region}:${c.accountId}:loadbalancer/${c.resourceId}`,
  'cloudfront:distribution': (c) => `arn:aws:cloudfront::${c.accountId}:distribution/${c.resourceId}`,
  'apigateway:restapi': (c) => `arn:aws:apigateway:${c.region}::/restapis/${c.resourceId}`,
  'vpc:vpc': (c) => `arn:aws:ec2:${c.region}:${c.accountId}:vpc/${c.resourceId}`,
  'vpc:subnet': (c) => `arn:aws:ec2:${c.region}:${c.accountId}:subnet/${c.resourceId}`,
  'transit-gateway': (c) => `arn:aws:ec2:${c.region}:${c.accountId}:transit-gateway/${c.resourceId}`,
  
  // Analytics
  'kinesis:stream': (c) => `arn:aws:kinesis:${c.region}:${c.accountId}:stream/${c.resourceId}`,
  'firehose:deliverystream': (c) => `arn:aws:firehose:${c.region}:${c.accountId}:deliverystream/${c.resourceId}`,
  'emr:cluster': (c) => `arn:aws:elasticmapreduce:${c.region}:${c.accountId}:cluster/${c.resourceId}`,
  'glue:database': (c) => `arn:aws:glue:${c.region}:${c.accountId}:database/${c.resourceId}`,
  'glue:crawler': (c) => `arn:aws:glue:${c.region}:${c.accountId}:crawler/${c.resourceId}`,
  'athena:workgroup': (c) => `arn:aws:athena:${c.region}:${c.accountId}:workgroup/${c.resourceId}`,
  
  // ML/AI
  'sagemaker:endpoint': (c) => `arn:aws:sagemaker:${c.region}:${c.accountId}:endpoint/${c.resourceId}`,
  'sagemaker:notebook': (c) => `arn:aws:sagemaker:${c.region}:${c.accountId}:notebook-instance/${c.resourceId}`,
  'sagemaker:training-job': (c) => `arn:aws:sagemaker:${c.region}:${c.accountId}:training-job/${c.resourceId}`,
  'bedrock:model': (c) => `arn:aws:bedrock:${c.region}:${c.accountId}:custom-model/${c.resourceId}`,
  
  // Integration
  'sqs:queue': (c) => `arn:aws:sqs:${c.region}:${c.accountId}:${c.resourceId}`,
  'sns:topic': (c) => `arn:aws:sns:${c.region}:${c.accountId}:${c.resourceId}`,
  'eventbridge:rule': (c) => `arn:aws:events:${c.region}:${c.accountId}:rule/${c.resourceId}`,
  'stepfunctions:statemachine': (c) => `arn:aws:states:${c.region}:${c.accountId}:stateMachine:${c.resourceId}`,
  
  // Security
  'kms:key': (c) => `arn:aws:kms:${c.region}:${c.accountId}:key/${c.resourceId}`,
  'secretsmanager:secret': (c) => `arn:aws:secretsmanager:${c.region}:${c.accountId}:secret:${c.resourceId}`,
  'waf:webacl': (c) => `arn:aws:wafv2:${c.region}:${c.accountId}:regional/webacl/${c.resourceId}`,
};

/**
 * Build ARN for a resource
 */
export function buildResourceArn(
  service: string,
  region: string,
  accountId: string,
  resourceType: string,
  resourceId: string
): string {
  const key = `${service.toLowerCase()}:${resourceType.toLowerCase()}`;
  const formatter = ARN_FORMATS[key];
  
  if (formatter) {
    return formatter({ service, region, accountId, resourceType, resourceId });
  }
  
  // Fallback to generic format
  return `arn:aws:${service}:${region}:${accountId}:${resourceType}/${resourceId}`;
}

/**
 * Parse ARN into components
 */
export function parseArn(arn: string): ArnComponents | null {
  const arnRegex = /^arn:aws:([^:]+):([^:]*):([^:]*):(.+)$/;
  const match = arn.match(arnRegex);
  
  if (!match) return null;
  
  const [, service, region, accountId, resource] = match;
  const resourceParts = resource.split(/[:/]/);
  
  return {
    service,
    region: region || 'global',
    accountId,
    resourceType: resourceParts.length > 1 ? resourceParts[0] : undefined,
    resourceId: resourceParts[resourceParts.length - 1],
  };
}

/**
 * Generate AWS Console URL from ARN
 */
export function getConsoleUrlFromArn(arn: string): string | null {
  const components = parseArn(arn);
  if (!components) return null;
  
  const { service, region, resourceId } = components;
  const baseUrl = `https://${region}.console.aws.amazon.com`;
  
  const consoleUrls: Record<string, string> = {
    'ec2': `${baseUrl}/ec2/v2/home?region=${region}#InstanceDetails:instanceId=${resourceId}`,
    'rds': `${baseUrl}/rds/home?region=${region}#database:id=${resourceId}`,
    'lambda': `${baseUrl}/lambda/home?region=${region}#/functions/${resourceId}`,
    's3': `https://s3.console.aws.amazon.com/s3/buckets/${resourceId}`,
    'dynamodb': `${baseUrl}/dynamodbv2/home?region=${region}#table?name=${resourceId}`,
    'elasticache': `${baseUrl}/elasticache/home?region=${region}#/redis/${resourceId}`,
    'sagemaker': `${baseUrl}/sagemaker/home?region=${region}#/endpoints/${resourceId}`,
  };
  
  return consoleUrls[service] || null;
}
```

---

## 2. Base Analyzer Interface

### File: `backend/src/lib/analyzers/types.ts`

```typescript
/**
 * Analyzer Types and Interfaces
 */

import type { AwsCredentials } from '../aws-helpers.js';

export interface AnalysisOptions {
  maxResources?: number;
  remainingTime?: number;
  analysisDepth?: 'standard' | 'deep';
  includeMetrics?: boolean;
}

export interface MLResult {
  resourceId: string;
  resourceArn: string;
  resourceName: string | null;
  resourceType: string;
  resourceSubtype?: string;
  region: string;
  accountId: string;
  
  // Current state
  currentSize: string;
  currentMonthlyCost: number;
  currentHourlyCost: number;
  
  // Recommendation
  recommendationType: 'terminate' | 'downsize' | 'auto-scale' | 'optimize' | 'migrate';
  recommendationPriority: number; // 1-5
  recommendedSize: string | null;
  potentialMonthlySavings: number;
  potentialAnnualSavings: number;
  mlConfidence: number;
  
  // Patterns
  utilizationPatterns: UtilizationPatterns;
  resourceMetadata: Record<string, any>;
  dependencies: ResourceDependency[];
  
  // Auto-scaling
  autoScalingEligible: boolean;
  autoScalingConfig: AutoScalingConfig | null;
  
  // Implementation
  implementationComplexity: 'low' | 'medium' | 'high';
  implementationSteps: ImplementationStep[];
  riskAssessment: 'low' | 'medium' | 'high';
  
  // Activity
  lastActivityAt: Date | null;
  daysSinceActivity: number | null;
  
  analyzedAt: Date;
}

export interface UtilizationPatterns {
  avgCpuUsage: number;
  maxCpuUsage: number;
  avgMemoryUsage: number;
  maxMemoryUsage: number;
  peakHours: number[];
  weekdayPattern: number[];
  hasRealMetrics: boolean;
  dataCompleteness: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  seasonality: 'daily' | 'weekly' | 'none';
}

export interface ResourceDependency {
  resourceArn: string;
  resourceType: string;
  dependencyType: 'uses' | 'used-by' | 'attached-to';
}

export interface AutoScalingConfig {
  min_capacity: number;
  max_capacity: number;
  target_cpu: number;
  scale_in_cooldown: number;
  scale_out_cooldown: number;
}

export interface ImplementationStep {
  order: number;
  action: string;
  command?: string;
  riskLevel: 'safe' | 'review' | 'destructive';
  rollbackCommand?: string;
  notes?: string;
}

export interface ResourceAnalyzer {
  readonly serviceName: string;
  readonly serviceCode: string;
  readonly priority: number;
  
  analyze(
    credentials: AwsCredentials,
    region: string,
    accountId: string,
    options: AnalysisOptions
  ): Promise<MLResult[]>;
  
  getEstimatedDuration(): number;
  getSupportedResourceTypes(): string[];
}
```



---

## 3. S3 Bucket Analyzer

### File: `backend/src/lib/analyzers/storage/s3-bucket-analyzer.ts`

```typescript
/**
 * S3 Bucket Analyzer
 * 
 * Detects waste patterns in S3 buckets:
 * - Empty buckets with no activity
 * - Buckets with no access (archive candidates)
 * - Infrequent access patterns (Intelligent-Tiering candidates)
 * - Version sprawl (excessive versions)
 * - Incomplete multipart uploads
 */

import { 
  S3Client, 
  ListBucketsCommand, 
  GetBucketLocationCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  ListMultipartUploadsCommand,
  GetBucketTaggingCommand,
} from '@aws-sdk/client-s3';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import type { ResourceAnalyzer, MLResult, AnalysisOptions, ImplementationStep } from '../types.js';
import { buildResourceArn } from '../../ml-analysis/arn-builder.js';
import { logger } from '../../logging.js';

// S3 Storage class pricing (us-east-1, per GB/month)
const S3_PRICING = {
  STANDARD: 0.023,
  INTELLIGENT_TIERING: 0.023,
  STANDARD_IA: 0.0125,
  ONEZONE_IA: 0.01,
  GLACIER_IR: 0.004,
  GLACIER_FR: 0.0036,
  GLACIER_DA: 0.00099,
};

export class S3BucketAnalyzer implements ResourceAnalyzer {
  readonly serviceName = 'Amazon S3';
  readonly serviceCode = 's3';
  readonly priority = 1; // High priority - major cost driver

  async analyze(
    credentials: any,
    region: string,
    accountId: string,
    options: AnalysisOptions
  ): Promise<MLResult[]> {
    const results: MLResult[] = [];
    const startTime = Date.now();
    const maxTime = options.remainingTime || 10000;

    try {
      const s3Client = new S3Client({ region: 'us-east-1', credentials }); // S3 ListBuckets is global
      const cwClient = new CloudWatchClient({ region, credentials });

      // List all buckets
      const bucketsResponse = await s3Client.send(new ListBucketsCommand({}));
      const buckets = bucketsResponse.Buckets || [];

      for (const bucket of buckets) {
        if (Date.now() - startTime > maxTime - 2000) {
          logger.warn('Time limit reached in S3 analysis');
          break;
        }

        const bucketName = bucket.Name!;

        try {
          // Get bucket region
          const locationResponse = await s3Client.send(
            new GetBucketLocationCommand({ Bucket: bucketName })
          );
          const bucketRegion = locationResponse.LocationConstraint || 'us-east-1';

          // Skip if not in target region (unless analyzing all regions)
          if (region !== 'all' && bucketRegion !== region) continue;

          // Get bucket metrics
          const metrics = await this.getBucketMetrics(cwClient, bucketName);
          
          // Get object count and size
          const objectStats = await this.getObjectStats(s3Client, bucketName);
          
          // Get version count
          const versionCount = await this.getVersionCount(s3Client, bucketName);
          
          // Get incomplete multipart uploads
          const incompleteUploads = await this.getIncompleteUploads(s3Client, bucketName);

          // Analyze waste patterns
          const wasteAnalysis = this.analyzeWastePatterns(
            bucketName,
            metrics,
            objectStats,
            versionCount,
            incompleteUploads
          );

          if (wasteAnalysis) {
            const arn = buildResourceArn('s3', bucketRegion, accountId, 'bucket', bucketName);
            
            results.push({
              resourceId: bucketName,
              resourceArn: arn,
              resourceName: bucketName,
              resourceType: 'S3::Bucket',
              resourceSubtype: 'Standard',
              region: bucketRegion,
              accountId,
              currentSize: `${(objectStats.totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`,
              currentMonthlyCost: wasteAnalysis.currentCost,
              currentHourlyCost: wasteAnalysis.currentCost / 730,
              recommendationType: wasteAnalysis.recommendationType,
              recommendationPriority: wasteAnalysis.priority,
              recommendedSize: wasteAnalysis.recommendedAction,
              potentialMonthlySavings: wasteAnalysis.savings,
              potentialAnnualSavings: wasteAnalysis.savings * 12,
              mlConfidence: wasteAnalysis.confidence,
              utilizationPatterns: {
                avgCpuUsage: 0,
                maxCpuUsage: 0,
                avgMemoryUsage: 0,
                maxMemoryUsage: 0,
                peakHours: [],
                weekdayPattern: [],
                hasRealMetrics: metrics.hasMetrics,
                dataCompleteness: metrics.dataCompleteness,
                trend: 'stable',
                seasonality: 'none',
              },
              resourceMetadata: {
                objectCount: objectStats.objectCount,
                totalSizeBytes: objectStats.totalSizeBytes,
                versionCount,
                incompleteUploads,
                createdAt: bucket.CreationDate,
                requestsLast30Days: metrics.totalRequests,
              },
              dependencies: [],
              autoScalingEligible: false,
              autoScalingConfig: null,
              implementationComplexity: wasteAnalysis.complexity,
              implementationSteps: wasteAnalysis.steps,
              riskAssessment: wasteAnalysis.risk,
              lastActivityAt: metrics.lastRequestTime,
              daysSinceActivity: metrics.daysSinceLastRequest,
              analyzedAt: new Date(),
            });
          }
        } catch (bucketErr) {
          logger.warn('Error analyzing S3 bucket', { 
            bucket: bucketName, 
            error: (bucketErr as Error).message 
          });
        }
      }
    } catch (err) {
      logger.error('Error in S3 analysis', err as Error, { region });
    }

    return results;
  }

  private async getBucketMetrics(
    cwClient: CloudWatchClient,
    bucketName: string
  ): Promise<{
    totalRequests: number;
    getRequests: number;
    putRequests: number;
    hasMetrics: boolean;
    dataCompleteness: number;
    lastRequestTime: Date | null;
    daysSinceLastRequest: number | null;
  }> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days

    try {
      const [getResponse, putResponse] = await Promise.all([
        cwClient.send(new GetMetricStatisticsCommand({
          Namespace: 'AWS/S3',
          MetricName: 'GetRequests',
          Dimensions: [
            { Name: 'BucketName', Value: bucketName },
            { Name: 'FilterId', Value: 'EntireBucket' },
          ],
          StartTime: startTime,
          EndTime: endTime,
          Period: 86400, // 1 day
          Statistics: ['Sum'],
        })),
        cwClient.send(new GetMetricStatisticsCommand({
          Namespace: 'AWS/S3',
          MetricName: 'PutRequests',
          Dimensions: [
            { Name: 'BucketName', Value: bucketName },
            { Name: 'FilterId', Value: 'EntireBucket' },
          ],
          StartTime: startTime,
          EndTime: endTime,
          Period: 86400,
          Statistics: ['Sum'],
        })),
      ]);

      const getRequests = getResponse.Datapoints?.reduce((sum, dp) => sum + (dp.Sum || 0), 0) || 0;
      const putRequests = putResponse.Datapoints?.reduce((sum, dp) => sum + (dp.Sum || 0), 0) || 0;
      
      const allDatapoints = [...(getResponse.Datapoints || []), ...(putResponse.Datapoints || [])];
      const lastDatapoint = allDatapoints
        .filter(dp => dp.Timestamp)
        .sort((a, b) => (b.Timestamp?.getTime() || 0) - (a.Timestamp?.getTime() || 0))[0];

      const lastRequestTime = lastDatapoint?.Timestamp || null;
      const daysSinceLastRequest = lastRequestTime 
        ? Math.floor((Date.now() - lastRequestTime.getTime()) / (24 * 60 * 60 * 1000))
        : null;

      return {
        totalRequests: getRequests + putRequests,
        getRequests,
        putRequests,
        hasMetrics: allDatapoints.length > 0,
        dataCompleteness: Math.min(1, allDatapoints.length / 30),
        lastRequestTime,
        daysSinceLastRequest,
      };
    } catch {
      return {
        totalRequests: 0,
        getRequests: 0,
        putRequests: 0,
        hasMetrics: false,
        dataCompleteness: 0,
        lastRequestTime: null,
        daysSinceLastRequest: null,
      };
    }
  }

  private async getObjectStats(
    s3Client: S3Client,
    bucketName: string
  ): Promise<{ objectCount: number; totalSizeBytes: number }> {
    try {
      let objectCount = 0;
      let totalSizeBytes = 0;
      let continuationToken: string | undefined;

      do {
        const response = await s3Client.send(new ListObjectsV2Command({
          Bucket: bucketName,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        }));

        objectCount += response.KeyCount || 0;
        totalSizeBytes += response.Contents?.reduce((sum, obj) => sum + (obj.Size || 0), 0) || 0;
        continuationToken = response.NextContinuationToken;

        // Limit to first 10000 objects for performance
        if (objectCount >= 10000) break;
      } while (continuationToken);

      return { objectCount, totalSizeBytes };
    } catch {
      return { objectCount: 0, totalSizeBytes: 0 };
    }
  }

  private async getVersionCount(s3Client: S3Client, bucketName: string): Promise<number> {
    try {
      const response = await s3Client.send(new ListObjectVersionsCommand({
        Bucket: bucketName,
        MaxKeys: 1000,
      }));
      return (response.Versions?.length || 0) + (response.DeleteMarkers?.length || 0);
    } catch {
      return 0;
    }
  }

  private async getIncompleteUploads(s3Client: S3Client, bucketName: string): Promise<number> {
    try {
      const response = await s3Client.send(new ListMultipartUploadsCommand({
        Bucket: bucketName,
        MaxUploads: 100,
      }));
      return response.Uploads?.length || 0;
    } catch {
      return 0;
    }
  }

  private analyzeWastePatterns(
    bucketName: string,
    metrics: any,
    objectStats: { objectCount: number; totalSizeBytes: number },
    versionCount: number,
    incompleteUploads: number
  ): {
    recommendationType: 'terminate' | 'migrate' | 'optimize';
    priority: number;
    recommendedAction: string;
    savings: number;
    confidence: number;
    complexity: 'low' | 'medium' | 'high';
    risk: 'low' | 'medium' | 'high';
    currentCost: number;
    steps: ImplementationStep[];
  } | null {
    const sizeGB = objectStats.totalSizeBytes / (1024 * 1024 * 1024);
    const currentCost = sizeGB * S3_PRICING.STANDARD;

    // Pattern 1: Empty bucket with no activity
    if (objectStats.objectCount === 0 && metrics.totalRequests === 0) {
      return {
        recommendationType: 'terminate',
        priority: 5,
        recommendedAction: 'Delete empty bucket',
        savings: 0, // No storage cost, but reduces clutter
        confidence: 0.95,
        complexity: 'low',
        risk: 'low',
        currentCost: 0,
        steps: [
          {
            order: 1,
            action: 'Verify bucket is empty',
            command: `aws s3 ls s3://${bucketName} --recursive`,
            riskLevel: 'safe',
          },
          {
            order: 2,
            action: 'Delete bucket',
            command: `aws s3 rb s3://${bucketName}`,
            riskLevel: 'destructive',
            notes: 'This action cannot be undone',
          },
        ],
      };
    }

    // Pattern 2: No access in 30+ days - migrate to Glacier
    if (metrics.daysSinceLastRequest && metrics.daysSinceLastRequest >= 30 && sizeGB > 1) {
      const glacierCost = sizeGB * S3_PRICING.GLACIER_IR;
      const savings = currentCost - glacierCost;
      
      return {
        recommendationType: 'migrate',
        priority: 4,
        recommendedAction: 'Migrate to Glacier Instant Retrieval',
        savings,
        confidence: 0.85,
        complexity: 'medium',
        risk: 'low',
        currentCost,
        steps: [
          {
            order: 1,
            action: 'Create lifecycle rule for Glacier transition',
            command: `aws s3api put-bucket-lifecycle-configuration --bucket ${bucketName} --lifecycle-configuration '{"Rules":[{"ID":"MoveToGlacier","Status":"Enabled","Filter":{},"Transitions":[{"Days":0,"StorageClass":"GLACIER_IR"}]}]}'`,
            riskLevel: 'review',
            notes: 'Objects will be transitioned to Glacier Instant Retrieval',
          },
        ],
      };
    }

    // Pattern 3: Infrequent access - enable Intelligent-Tiering
    if (metrics.totalRequests < 100 && sizeGB > 10) {
      return {
        recommendationType: 'optimize',
        priority: 3,
        recommendedAction: 'Enable Intelligent-Tiering',
        savings: currentCost * 0.3, // Estimated 30% savings
        confidence: 0.75,
        complexity: 'low',
        risk: 'low',
        currentCost,
        steps: [
          {
            order: 1,
            action: 'Create lifecycle rule for Intelligent-Tiering',
            command: `aws s3api put-bucket-lifecycle-configuration --bucket ${bucketName} --lifecycle-configuration '{"Rules":[{"ID":"IntelligentTiering","Status":"Enabled","Filter":{},"Transitions":[{"Days":0,"StorageClass":"INTELLIGENT_TIERING"}]}]}'`,
            riskLevel: 'safe',
          },
        ],
      };
    }

    // Pattern 4: Incomplete multipart uploads
    if (incompleteUploads > 10) {
      return {
        recommendationType: 'optimize',
        priority: 2,
        recommendedAction: 'Abort incomplete multipart uploads',
        savings: 0.5, // Estimated storage waste
        confidence: 0.90,
        complexity: 'low',
        risk: 'low',
        currentCost,
        steps: [
          {
            order: 1,
            action: 'List incomplete uploads',
            command: `aws s3api list-multipart-uploads --bucket ${bucketName}`,
            riskLevel: 'safe',
          },
          {
            order: 2,
            action: 'Create lifecycle rule to auto-abort',
            command: `aws s3api put-bucket-lifecycle-configuration --bucket ${bucketName} --lifecycle-configuration '{"Rules":[{"ID":"AbortIncomplete","Status":"Enabled","Filter":{},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}}]}'`,
            riskLevel: 'safe',
          },
        ],
      };
    }

    return null; // No waste detected
  }

  getEstimatedDuration(): number {
    return 5000; // 5 seconds
  }

  getSupportedResourceTypes(): string[] {
    return ['S3::Bucket'];
  }
}
```



---

## 4. NAT Gateway Analyzer

### File: `backend/src/lib/analyzers/network/nat-gateway-analyzer.ts`

```typescript
/**
 * NAT Gateway Analyzer
 * 
 * Detects waste patterns in NAT Gateways:
 * - Zero/near-zero traffic NAT Gateways
 * - Low-traffic NAT Gateways (NAT Instance candidates)
 * - Redundant NAT Gateways
 */

import { 
  EC2Client, 
  DescribeNatGatewaysCommand,
  DescribeRouteTablesCommand,
} from '@aws-sdk/client-ec2';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import type { ResourceAnalyzer, MLResult, AnalysisOptions, ImplementationStep } from '../types.js';
import { buildResourceArn } from '../../ml-analysis/arn-builder.js';
import { logger } from '../../logging.js';

// NAT Gateway pricing
const NAT_GATEWAY_PRICING = {
  hourlyRate: 0.045,      // $0.045 per hour
  dataProcessingPerGB: 0.045, // $0.045 per GB processed
  monthlyFixed: 32.85,    // $0.045 * 730 hours
};

export class NATGatewayAnalyzer implements ResourceAnalyzer {
  readonly serviceName = 'NAT Gateway';
  readonly serviceCode = 'ec2:nat-gateway';
  readonly priority = 2; // High priority - significant cost

  async analyze(
    credentials: any,
    region: string,
    accountId: string,
    options: AnalysisOptions
  ): Promise<MLResult[]> {
    const results: MLResult[] = [];
    const startTime = Date.now();
    const maxTime = options.remainingTime || 10000;

    try {
      const ec2Client = new EC2Client({ region, credentials });
      const cwClient = new CloudWatchClient({ region, credentials });

      // Get all NAT Gateways
      const natResponse = await ec2Client.send(new DescribeNatGatewaysCommand({
        Filter: [{ Name: 'state', Values: ['available'] }],
      }));

      const natGateways = natResponse.NatGateways || [];

      for (const natGw of natGateways) {
        if (Date.now() - startTime > maxTime - 2000) {
          logger.warn('Time limit reached in NAT Gateway analysis');
          break;
        }

        const natGatewayId = natGw.NatGatewayId!;
        const natName = natGw.Tags?.find(t => t.Key === 'Name')?.Value || null;

        try {
          // Get traffic metrics
          const metrics = await this.getNATMetrics(cwClient, natGatewayId);
          
          // Get route table associations
          const routeTables = await this.getAssociatedRouteTables(ec2Client, natGatewayId);

          // Analyze waste patterns
          const wasteAnalysis = this.analyzeWastePatterns(
            natGatewayId,
            natName,
            metrics,
            routeTables.length
          );

          if (wasteAnalysis) {
            const arn = buildResourceArn('ec2', region, accountId, 'nat-gateway', natGatewayId);
            
            results.push({
              resourceId: natGatewayId,
              resourceArn: arn,
              resourceName: natName,
              resourceType: 'EC2::NatGateway',
              region,
              accountId,
              currentSize: 'NAT Gateway',
              currentMonthlyCost: wasteAnalysis.currentCost,
              currentHourlyCost: NAT_GATEWAY_PRICING.hourlyRate,
              recommendationType: wasteAnalysis.recommendationType,
              recommendationPriority: wasteAnalysis.priority,
              recommendedSize: wasteAnalysis.recommendedAction,
              potentialMonthlySavings: wasteAnalysis.savings,
              potentialAnnualSavings: wasteAnalysis.savings * 12,
              mlConfidence: wasteAnalysis.confidence,
              utilizationPatterns: {
                avgCpuUsage: 0,
                maxCpuUsage: 0,
                avgMemoryUsage: 0,
                maxMemoryUsage: 0,
                peakHours: metrics.peakHours,
                weekdayPattern: [],
                hasRealMetrics: metrics.hasMetrics,
                dataCompleteness: metrics.dataCompleteness,
                trend: metrics.trend,
                seasonality: 'none',
              },
              resourceMetadata: {
                vpcId: natGw.VpcId,
                subnetId: natGw.SubnetId,
                publicIp: natGw.NatGatewayAddresses?.[0]?.PublicIp,
                privateIp: natGw.NatGatewayAddresses?.[0]?.PrivateIp,
                createdAt: natGw.CreateTime,
                bytesOutLast7Days: metrics.bytesOut,
                bytesInLast7Days: metrics.bytesIn,
                activeConnections: metrics.activeConnections,
                associatedRouteTables: routeTables.length,
              },
              dependencies: routeTables.map(rt => ({
                resourceArn: buildResourceArn('ec2', region, accountId, 'route-table', rt),
                resourceType: 'EC2::RouteTable',
                dependencyType: 'used-by' as const,
              })),
              autoScalingEligible: false,
              autoScalingConfig: null,
              implementationComplexity: wasteAnalysis.complexity,
              implementationSteps: wasteAnalysis.steps,
              riskAssessment: wasteAnalysis.risk,
              lastActivityAt: metrics.lastActivityTime,
              daysSinceActivity: metrics.daysSinceActivity,
              analyzedAt: new Date(),
            });
          }
        } catch (natErr) {
          logger.warn('Error analyzing NAT Gateway', { 
            natGatewayId, 
            error: (natErr as Error).message 
          });
        }
      }
    } catch (err) {
      logger.error('Error in NAT Gateway analysis', err as Error, { region });
    }

    return results;
  }

  private async getNATMetrics(
    cwClient: CloudWatchClient,
    natGatewayId: string
  ): Promise<{
    bytesOut: number;
    bytesIn: number;
    activeConnections: number;
    packetsDropped: number;
    hasMetrics: boolean;
    dataCompleteness: number;
    peakHours: number[];
    trend: 'increasing' | 'stable' | 'decreasing';
    lastActivityTime: Date | null;
    daysSinceActivity: number | null;
  }> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days

    try {
      const [bytesOutRes, bytesInRes, connectionsRes] = await Promise.all([
        cwClient.send(new GetMetricStatisticsCommand({
          Namespace: 'AWS/NATGateway',
          MetricName: 'BytesOutToDestination',
          Dimensions: [{ Name: 'NatGatewayId', Value: natGatewayId }],
          StartTime: startTime,
          EndTime: endTime,
          Period: 3600, // 1 hour
          Statistics: ['Sum'],
        })),
        cwClient.send(new GetMetricStatisticsCommand({
          Namespace: 'AWS/NATGateway',
          MetricName: 'BytesInFromDestination',
          Dimensions: [{ Name: 'NatGatewayId', Value: natGatewayId }],
          StartTime: startTime,
          EndTime: endTime,
          Period: 3600,
          Statistics: ['Sum'],
        })),
        cwClient.send(new GetMetricStatisticsCommand({
          Namespace: 'AWS/NATGateway',
          MetricName: 'ActiveConnectionCount',
          Dimensions: [{ Name: 'NatGatewayId', Value: natGatewayId }],
          StartTime: startTime,
          EndTime: endTime,
          Period: 3600,
          Statistics: ['Average', 'Maximum'],
        })),
      ]);

      const bytesOut = bytesOutRes.Datapoints?.reduce((sum, dp) => sum + (dp.Sum || 0), 0) || 0;
      const bytesIn = bytesInRes.Datapoints?.reduce((sum, dp) => sum + (dp.Sum || 0), 0) || 0;
      const activeConnections = connectionsRes.Datapoints?.length 
        ? connectionsRes.Datapoints.reduce((sum, dp) => sum + (dp.Average || 0), 0) / connectionsRes.Datapoints.length
        : 0;

      // Calculate peak hours
      const hourlyData: Record<number, number> = {};
      for (const dp of bytesOutRes.Datapoints || []) {
        if (dp.Timestamp && dp.Sum) {
          const hour = dp.Timestamp.getUTCHours();
          hourlyData[hour] = (hourlyData[hour] || 0) + dp.Sum;
        }
      }
      const avgTraffic = Object.values(hourlyData).reduce((a, b) => a + b, 0) / 24;
      const peakHours = Object.entries(hourlyData)
        .filter(([_, traffic]) => traffic > avgTraffic * 1.5)
        .map(([hour]) => parseInt(hour));

      // Calculate trend
      const sortedDatapoints = (bytesOutRes.Datapoints || [])
        .filter(dp => dp.Timestamp)
        .sort((a, b) => a.Timestamp!.getTime() - b.Timestamp!.getTime());
      
      let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
      if (sortedDatapoints.length >= 2) {
        const firstHalf = sortedDatapoints.slice(0, Math.floor(sortedDatapoints.length / 2));
        const secondHalf = sortedDatapoints.slice(Math.floor(sortedDatapoints.length / 2));
        const firstAvg = firstHalf.reduce((sum, dp) => sum + (dp.Sum || 0), 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, dp) => sum + (dp.Sum || 0), 0) / secondHalf.length;
        
        if (secondAvg > firstAvg * 1.2) trend = 'increasing';
        else if (secondAvg < firstAvg * 0.8) trend = 'decreasing';
      }

      const lastDatapoint = sortedDatapoints[sortedDatapoints.length - 1];
      const lastActivityTime = lastDatapoint?.Timestamp || null;
      const daysSinceActivity = lastActivityTime
        ? Math.floor((Date.now() - lastActivityTime.getTime()) / (24 * 60 * 60 * 1000))
        : null;

      return {
        bytesOut,
        bytesIn,
        activeConnections,
        packetsDropped: 0,
        hasMetrics: (bytesOutRes.Datapoints?.length || 0) > 0,
        dataCompleteness: Math.min(1, (bytesOutRes.Datapoints?.length || 0) / 168),
        peakHours,
        trend,
        lastActivityTime,
        daysSinceActivity,
      };
    } catch {
      return {
        bytesOut: 0,
        bytesIn: 0,
        activeConnections: 0,
        packetsDropped: 0,
        hasMetrics: false,
        dataCompleteness: 0,
        peakHours: [],
        trend: 'stable',
        lastActivityTime: null,
        daysSinceActivity: null,
      };
    }
  }

  private async getAssociatedRouteTables(
    ec2Client: EC2Client,
    natGatewayId: string
  ): Promise<string[]> {
    try {
      const response = await ec2Client.send(new DescribeRouteTablesCommand({
        Filters: [{ Name: 'route.nat-gateway-id', Values: [natGatewayId] }],
      }));
      return response.RouteTables?.map(rt => rt.RouteTableId!) || [];
    } catch {
      return [];
    }
  }

  private analyzeWastePatterns(
    natGatewayId: string,
    natName: string | null,
    metrics: any,
    routeTableCount: number
  ): {
    recommendationType: 'terminate' | 'downsize' | 'optimize';
    priority: number;
    recommendedAction: string;
    savings: number;
    confidence: number;
    complexity: 'low' | 'medium' | 'high';
    risk: 'low' | 'medium' | 'high';
    currentCost: number;
    steps: ImplementationStep[];
  } | null {
    const totalBytesGB = (metrics.bytesOut + metrics.bytesIn) / (1024 * 1024 * 1024);
    const dataProcessingCost = totalBytesGB * NAT_GATEWAY_PRICING.dataProcessingPerGB * (30 / 7); // Monthly estimate
    const currentCost = NAT_GATEWAY_PRICING.monthlyFixed + dataProcessingCost;

    // Pattern 1: Zero traffic - terminate
    if (metrics.bytesOut === 0 && metrics.bytesIn === 0) {
      return {
        recommendationType: 'terminate',
        priority: 5,
        recommendedAction: 'Delete unused NAT Gateway',
        savings: NAT_GATEWAY_PRICING.monthlyFixed,
        confidence: 0.95,
        complexity: routeTableCount > 0 ? 'medium' : 'low',
        risk: routeTableCount > 0 ? 'medium' : 'low',
        currentCost,
        steps: [
          {
            order: 1,
            action: 'Verify no active connections',
            command: `aws cloudwatch get-metric-statistics --namespace AWS/NATGateway --metric-name ActiveConnectionCount --dimensions Name=NatGatewayId,Value=${natGatewayId} --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) --period 300 --statistics Maximum --region ${metrics.region || 'us-east-1'}`,
            riskLevel: 'safe',
          },
          ...(routeTableCount > 0 ? [{
            order: 2,
            action: 'Update route tables to remove NAT Gateway route',
            command: `# For each route table, remove the NAT Gateway route\naws ec2 delete-route --route-table-id <ROUTE_TABLE_ID> --destination-cidr-block 0.0.0.0/0`,
            riskLevel: 'review' as const,
            notes: `${routeTableCount} route table(s) reference this NAT Gateway`,
          }] : []),
          {
            order: routeTableCount > 0 ? 3 : 2,
            action: 'Delete NAT Gateway',
            command: `aws ec2 delete-nat-gateway --nat-gateway-id ${natGatewayId}`,
            riskLevel: 'destructive',
            notes: 'This will release the associated Elastic IP',
          },
        ],
      };
    }

    // Pattern 2: Very low traffic - consider NAT Instance
    if (metrics.activeConnections < 10 && totalBytesGB < 1) {
      const natInstanceCost = 3.80; // t3.nano monthly cost
      const savings = currentCost - natInstanceCost;
      
      if (savings > 10) {
        return {
          recommendationType: 'downsize',
          priority: 3,
          recommendedAction: 'Replace with NAT Instance (t3.nano)',
          savings,
          confidence: 0.70,
          complexity: 'high',
          risk: 'medium',
          currentCost,
          steps: [
            {
              order: 1,
              action: 'Launch NAT Instance',
              command: `aws ec2 run-instances --image-id ami-xxxxxxxx --instance-type t3.nano --subnet-id <PUBLIC_SUBNET_ID> --security-group-ids <SG_ID> --source-dest-check false`,
              riskLevel: 'review',
              notes: 'Use Amazon Linux NAT AMI',
            },
            {
              order: 2,
              action: 'Update route tables',
              command: `aws ec2 replace-route --route-table-id <ROUTE_TABLE_ID> --destination-cidr-block 0.0.0.0/0 --instance-id <NAT_INSTANCE_ID>`,
              riskLevel: 'review',
            },
            {
              order: 3,
              action: 'Delete NAT Gateway after verification',
              command: `aws ec2 delete-nat-gateway --nat-gateway-id ${natGatewayId}`,
              riskLevel: 'destructive',
            },
          ],
        };
      }
    }

    return null; // No significant waste detected
  }

  getEstimatedDuration(): number {
    return 3000; // 3 seconds
  }

  getSupportedResourceTypes(): string[] {
    return ['EC2::NatGateway'];
  }
}
```



---

## 5. DynamoDB Table Analyzer

### File: `backend/src/lib/analyzers/database/dynamodb-table-analyzer.ts`

```typescript
/**
 * DynamoDB Table Analyzer
 * 
 * Detects waste patterns in DynamoDB tables:
 * - Over-provisioned tables (low utilization)
 * - Unused tables (zero read/write)
 * - On-Demand tables with consistent usage (switch to Provisioned)
 * - Provisioned tables with variable usage (switch to On-Demand)
 */

import { 
  DynamoDBClient, 
  ListTablesCommand, 
  DescribeTableCommand,
  DescribeContinuousBackupsCommand,
} from '@aws-sdk/client-dynamodb';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import type { ResourceAnalyzer, MLResult, AnalysisOptions, ImplementationStep } from '../types.js';
import { buildResourceArn } from '../../ml-analysis/arn-builder.js';
import { logger } from '../../logging.js';

// DynamoDB pricing (us-east-1)
const DYNAMODB_PRICING = {
  // On-Demand
  onDemandReadPerUnit: 0.00000025,  // $0.25 per million RRU
  onDemandWritePerUnit: 0.00000125, // $1.25 per million WRU
  
  // Provisioned
  provisionedReadPerUnit: 0.00013,  // $0.00013 per RCU per hour
  provisionedWritePerUnit: 0.00065, // $0.00065 per WCU per hour
  
  // Storage
  storagePerGBMonth: 0.25,
};

export class DynamoDBTableAnalyzer implements ResourceAnalyzer {
  readonly serviceName = 'Amazon DynamoDB';
  readonly serviceCode = 'dynamodb';
  readonly priority = 2;

  async analyze(
    credentials: any,
    region: string,
    accountId: string,
    options: AnalysisOptions
  ): Promise<MLResult[]> {
    const results: MLResult[] = [];
    const startTime = Date.now();
    const maxTime = options.remainingTime || 10000;

    try {
      const ddbClient = new DynamoDBClient({ region, credentials });
      const cwClient = new CloudWatchClient({ region, credentials });

      // List all tables
      let tableNames: string[] = [];
      let lastEvaluatedTableName: string | undefined;

      do {
        const listResponse = await ddbClient.send(new ListTablesCommand({
          ExclusiveStartTableName: lastEvaluatedTableName,
          Limit: 100,
        }));
        tableNames.push(...(listResponse.TableNames || []));
        lastEvaluatedTableName = listResponse.LastEvaluatedTableName;
      } while (lastEvaluatedTableName && tableNames.length < (options.maxResources || 50));

      for (const tableName of tableNames) {
        if (Date.now() - startTime > maxTime - 2000) {
          logger.warn('Time limit reached in DynamoDB analysis');
          break;
        }

        try {
          // Get table details
          const tableResponse = await ddbClient.send(new DescribeTableCommand({
            TableName: tableName,
          }));
          const table = tableResponse.Table!;

          // Get capacity metrics
          const metrics = await this.getTableMetrics(cwClient, tableName);

          // Analyze waste patterns
          const wasteAnalysis = this.analyzeWastePatterns(
            tableName,
            table,
            metrics
          );

          if (wasteAnalysis) {
            const arn = buildResourceArn('dynamodb', region, accountId, 'table', tableName);
            
            results.push({
              resourceId: tableName,
              resourceArn: arn,
              resourceName: tableName,
              resourceType: 'DynamoDB::Table',
              resourceSubtype: table.BillingModeSummary?.BillingMode || 'PROVISIONED',
              region,
              accountId,
              currentSize: `${((table.TableSizeBytes || 0) / (1024 * 1024 * 1024)).toFixed(2)} GB`,
              currentMonthlyCost: wasteAnalysis.currentCost,
              currentHourlyCost: wasteAnalysis.currentCost / 730,
              recommendationType: wasteAnalysis.recommendationType,
              recommendationPriority: wasteAnalysis.priority,
              recommendedSize: wasteAnalysis.recommendedAction,
              potentialMonthlySavings: wasteAnalysis.savings,
              potentialAnnualSavings: wasteAnalysis.savings * 12,
              mlConfidence: wasteAnalysis.confidence,
              utilizationPatterns: {
                avgCpuUsage: metrics.avgReadUtilization,
                maxCpuUsage: metrics.maxReadUtilization,
                avgMemoryUsage: metrics.avgWriteUtilization,
                maxMemoryUsage: metrics.maxWriteUtilization,
                peakHours: metrics.peakHours,
                weekdayPattern: [],
                hasRealMetrics: metrics.hasMetrics,
                dataCompleteness: metrics.dataCompleteness,
                trend: metrics.trend,
                seasonality: 'none',
              },
              resourceMetadata: {
                billingMode: table.BillingModeSummary?.BillingMode,
                provisionedRCU: table.ProvisionedThroughput?.ReadCapacityUnits,
                provisionedWCU: table.ProvisionedThroughput?.WriteCapacityUnits,
                tableSizeBytes: table.TableSizeBytes,
                itemCount: table.ItemCount,
                createdAt: table.CreationDateTime,
                gsiCount: table.GlobalSecondaryIndexes?.length || 0,
                lsiCount: table.LocalSecondaryIndexes?.length || 0,
                avgConsumedRCU: metrics.avgConsumedRCU,
                avgConsumedWCU: metrics.avgConsumedWCU,
                throttledRequests: metrics.throttledRequests,
              },
              dependencies: [],
              autoScalingEligible: table.BillingModeSummary?.BillingMode === 'PROVISIONED',
              autoScalingConfig: null,
              implementationComplexity: wasteAnalysis.complexity,
              implementationSteps: wasteAnalysis.steps,
              riskAssessment: wasteAnalysis.risk,
              lastActivityAt: metrics.lastActivityTime,
              daysSinceActivity: metrics.daysSinceActivity,
              analyzedAt: new Date(),
            });
          }
        } catch (tableErr) {
          logger.warn('Error analyzing DynamoDB table', { 
            tableName, 
            error: (tableErr as Error).message 
          });
        }
      }
    } catch (err) {
      logger.error('Error in DynamoDB analysis', err as Error, { region });
    }

    return results;
  }

  private async getTableMetrics(
    cwClient: CloudWatchClient,
    tableName: string
  ): Promise<{
    avgConsumedRCU: number;
    avgConsumedWCU: number;
    maxConsumedRCU: number;
    maxConsumedWCU: number;
    avgReadUtilization: number;
    avgWriteUtilization: number;
    maxReadUtilization: number;
    maxWriteUtilization: number;
    throttledRequests: number;
    hasMetrics: boolean;
    dataCompleteness: number;
    peakHours: number[];
    trend: 'increasing' | 'stable' | 'decreasing';
    lastActivityTime: Date | null;
    daysSinceActivity: number | null;
  }> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);

    try {
      const [rcuRes, wcuRes, throttleRes] = await Promise.all([
        cwClient.send(new GetMetricStatisticsCommand({
          Namespace: 'AWS/DynamoDB',
          MetricName: 'ConsumedReadCapacityUnits',
          Dimensions: [{ Name: 'TableName', Value: tableName }],
          StartTime: startTime,
          EndTime: endTime,
          Period: 3600,
          Statistics: ['Average', 'Maximum', 'Sum'],
        })),
        cwClient.send(new GetMetricStatisticsCommand({
          Namespace: 'AWS/DynamoDB',
          MetricName: 'ConsumedWriteCapacityUnits',
          Dimensions: [{ Name: 'TableName', Value: tableName }],
          StartTime: startTime,
          EndTime: endTime,
          Period: 3600,
          Statistics: ['Average', 'Maximum', 'Sum'],
        })),
        cwClient.send(new GetMetricStatisticsCommand({
          Namespace: 'AWS/DynamoDB',
          MetricName: 'ThrottledRequests',
          Dimensions: [{ Name: 'TableName', Value: tableName }],
          StartTime: startTime,
          EndTime: endTime,
          Period: 86400,
          Statistics: ['Sum'],
        })),
      ]);

      const rcuDatapoints = rcuRes.Datapoints || [];
      const wcuDatapoints = wcuRes.Datapoints || [];

      const avgConsumedRCU = rcuDatapoints.length 
        ? rcuDatapoints.reduce((sum, dp) => sum + (dp.Average || 0), 0) / rcuDatapoints.length
        : 0;
      const avgConsumedWCU = wcuDatapoints.length
        ? wcuDatapoints.reduce((sum, dp) => sum + (dp.Average || 0), 0) / wcuDatapoints.length
        : 0;
      const maxConsumedRCU = Math.max(...rcuDatapoints.map(dp => dp.Maximum || 0), 0);
      const maxConsumedWCU = Math.max(...wcuDatapoints.map(dp => dp.Maximum || 0), 0);

      const throttledRequests = throttleRes.Datapoints?.reduce((sum, dp) => sum + (dp.Sum || 0), 0) || 0;

      // Calculate peak hours
      const hourlyRCU: Record<number, number[]> = {};
      for (const dp of rcuDatapoints) {
        if (dp.Timestamp && dp.Average) {
          const hour = dp.Timestamp.getUTCHours();
          if (!hourlyRCU[hour]) hourlyRCU[hour] = [];
          hourlyRCU[hour].push(dp.Average);
        }
      }
      const avgHourlyRCU = Object.entries(hourlyRCU).map(([hour, values]) => ({
        hour: parseInt(hour),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
      }));
      const overallAvg = avgHourlyRCU.reduce((sum, h) => sum + h.avg, 0) / (avgHourlyRCU.length || 1);
      const peakHours = avgHourlyRCU
        .filter(h => h.avg > overallAvg * 1.5)
        .map(h => h.hour);

      // Calculate trend
      const sortedRCU = rcuDatapoints
        .filter(dp => dp.Timestamp)
        .sort((a, b) => a.Timestamp!.getTime() - b.Timestamp!.getTime());
      
      let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
      if (sortedRCU.length >= 2) {
        const firstHalf = sortedRCU.slice(0, Math.floor(sortedRCU.length / 2));
        const secondHalf = sortedRCU.slice(Math.floor(sortedRCU.length / 2));
        const firstAvg = firstHalf.reduce((sum, dp) => sum + (dp.Average || 0), 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, dp) => sum + (dp.Average || 0), 0) / secondHalf.length;
        
        if (secondAvg > firstAvg * 1.2) trend = 'increasing';
        else if (secondAvg < firstAvg * 0.8) trend = 'decreasing';
      }

      const lastDatapoint = sortedRCU[sortedRCU.length - 1];
      const lastActivityTime = lastDatapoint?.Timestamp || null;
      const daysSinceActivity = lastActivityTime
        ? Math.floor((Date.now() - lastActivityTime.getTime()) / (24 * 60 * 60 * 1000))
        : null;

      return {
        avgConsumedRCU,
        avgConsumedWCU,
        maxConsumedRCU,
        maxConsumedWCU,
        avgReadUtilization: 0, // Will be calculated with provisioned capacity
        avgWriteUtilization: 0,
        maxReadUtilization: 0,
        maxWriteUtilization: 0,
        throttledRequests,
        hasMetrics: rcuDatapoints.length > 0 || wcuDatapoints.length > 0,
        dataCompleteness: Math.min(1, rcuDatapoints.length / 168),
        peakHours,
        trend,
        lastActivityTime,
        daysSinceActivity,
      };
    } catch {
      return {
        avgConsumedRCU: 0,
        avgConsumedWCU: 0,
        maxConsumedRCU: 0,
        maxConsumedWCU: 0,
        avgReadUtilization: 0,
        avgWriteUtilization: 0,
        maxReadUtilization: 0,
        maxWriteUtilization: 0,
        throttledRequests: 0,
        hasMetrics: false,
        dataCompleteness: 0,
        peakHours: [],
        trend: 'stable',
        lastActivityTime: null,
        daysSinceActivity: null,
      };
    }
  }

  private analyzeWastePatterns(
    tableName: string,
    table: any,
    metrics: any
  ): {
    recommendationType: 'terminate' | 'downsize' | 'optimize';
    priority: number;
    recommendedAction: string;
    savings: number;
    confidence: number;
    complexity: 'low' | 'medium' | 'high';
    risk: 'low' | 'medium' | 'high';
    currentCost: number;
    steps: ImplementationStep[];
  } | null {
    const billingMode = table.BillingModeSummary?.BillingMode || 'PROVISIONED';
    const provisionedRCU = table.ProvisionedThroughput?.ReadCapacityUnits || 0;
    const provisionedWCU = table.ProvisionedThroughput?.WriteCapacityUnits || 0;
    const storageSizeGB = (table.TableSizeBytes || 0) / (1024 * 1024 * 1024);

    // Calculate current cost
    let currentCost = storageSizeGB * DYNAMODB_PRICING.storagePerGBMonth;
    
    if (billingMode === 'PROVISIONED') {
      currentCost += provisionedRCU * DYNAMODB_PRICING.provisionedReadPerUnit * 730;
      currentCost += provisionedWCU * DYNAMODB_PRICING.provisionedWritePerUnit * 730;
    } else {
      // On-Demand - estimate from consumed capacity
      const monthlyRRU = metrics.avgConsumedRCU * 3600 * 730;
      const monthlyWRU = metrics.avgConsumedWCU * 3600 * 730;
      currentCost += monthlyRRU * DYNAMODB_PRICING.onDemandReadPerUnit;
      currentCost += monthlyWRU * DYNAMODB_PRICING.onDemandWritePerUnit;
    }

    // Pattern 1: Zero usage - terminate
    if (metrics.avgConsumedRCU === 0 && metrics.avgConsumedWCU === 0 && !metrics.hasMetrics) {
      return {
        recommendationType: 'terminate',
        priority: 5,
        recommendedAction: 'Delete unused table (backup first)',
        savings: currentCost,
        confidence: 0.85,
        complexity: 'medium',
        risk: 'high',
        currentCost,
        steps: [
          {
            order: 1,
            action: 'Create backup before deletion',
            command: `aws dynamodb create-backup --table-name ${tableName} --backup-name ${tableName}-backup-$(date +%Y%m%d)`,
            riskLevel: 'safe',
          },
          {
            order: 2,
            action: 'Verify no active connections',
            command: `aws cloudwatch get-metric-statistics --namespace AWS/DynamoDB --metric-name ConsumedReadCapacityUnits --dimensions Name=TableName,Value=${tableName} --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ) --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) --period 3600 --statistics Sum`,
            riskLevel: 'safe',
          },
          {
            order: 3,
            action: 'Delete table',
            command: `aws dynamodb delete-table --table-name ${tableName}`,
            riskLevel: 'destructive',
            rollbackCommand: `aws dynamodb restore-table-from-backup --target-table-name ${tableName} --backup-arn <BACKUP_ARN>`,
          },
        ],
      };
    }

    // Pattern 2: Provisioned with low utilization - switch to On-Demand
    if (billingMode === 'PROVISIONED' && provisionedRCU > 0) {
      const readUtilization = (metrics.avgConsumedRCU / provisionedRCU) * 100;
      const writeUtilization = provisionedWCU > 0 ? (metrics.avgConsumedWCU / provisionedWCU) * 100 : 0;

      if (readUtilization < 20 && writeUtilization < 20) {
        // Calculate On-Demand cost
        const monthlyRRU = metrics.avgConsumedRCU * 3600 * 730;
        const monthlyWRU = metrics.avgConsumedWCU * 3600 * 730;
        const onDemandCost = storageSizeGB * DYNAMODB_PRICING.storagePerGBMonth +
          monthlyRRU * DYNAMODB_PRICING.onDemandReadPerUnit +
          monthlyWRU * DYNAMODB_PRICING.onDemandWritePerUnit;

        const savings = currentCost - onDemandCost;

        if (savings > 5) {
          return {
            recommendationType: 'optimize',
            priority: 4,
            recommendedAction: 'Switch to On-Demand billing',
            savings,
            confidence: 0.80,
            complexity: 'low',
            risk: 'low',
            currentCost,
            steps: [
              {
                order: 1,
                action: 'Switch to On-Demand billing mode',
                command: `aws dynamodb update-table --table-name ${tableName} --billing-mode PAY_PER_REQUEST`,
                riskLevel: 'safe',
                notes: 'Table will be briefly unavailable during transition',
              },
            ],
          };
        }
      }
    }

    // Pattern 3: On-Demand with consistent high usage - switch to Provisioned
    if (billingMode === 'PAY_PER_REQUEST' && metrics.avgConsumedRCU > 100) {
      const stdDevRatio = metrics.maxConsumedRCU / (metrics.avgConsumedRCU || 1);
      
      if (stdDevRatio < 2) { // Consistent usage
        const recommendedRCU = Math.ceil(metrics.maxConsumedRCU * 1.2);
        const recommendedWCU = Math.ceil(metrics.maxConsumedWCU * 1.2);
        
        const provisionedCost = storageSizeGB * DYNAMODB_PRICING.storagePerGBMonth +
          recommendedRCU * DYNAMODB_PRICING.provisionedReadPerUnit * 730 +
          recommendedWCU * DYNAMODB_PRICING.provisionedWritePerUnit * 730;

        const savings = currentCost - provisionedCost;

        if (savings > 10) {
          return {
            recommendationType: 'optimize',
            priority: 3,
            recommendedAction: `Switch to Provisioned (${recommendedRCU} RCU, ${recommendedWCU} WCU)`,
            savings,
            confidence: 0.75,
            complexity: 'medium',
            risk: 'medium',
            currentCost,
            steps: [
              {
                order: 1,
                action: 'Switch to Provisioned billing mode',
                command: `aws dynamodb update-table --table-name ${tableName} --billing-mode PROVISIONED --provisioned-throughput ReadCapacityUnits=${recommendedRCU},WriteCapacityUnits=${recommendedWCU}`,
                riskLevel: 'review',
                notes: 'Consider enabling auto-scaling after switch',
              },
              {
                order: 2,
                action: 'Enable auto-scaling (recommended)',
                command: `aws application-autoscaling register-scalable-target --service-namespace dynamodb --resource-id table/${tableName} --scalable-dimension dynamodb:table:ReadCapacityUnits --min-capacity ${Math.ceil(recommendedRCU * 0.5)} --max-capacity ${recommendedRCU * 2}`,
                riskLevel: 'safe',
              },
            ],
          };
        }
      }
    }

    return null;
  }

  getEstimatedDuration(): number {
    return 4000;
  }

  getSupportedResourceTypes(): string[] {
    return ['DynamoDB::Table'];
  }
}
```



---

## 6. Parallel Executor

### File: `backend/src/lib/execution/parallel-executor.ts`

```typescript
/**
 * Parallel Executor
 * 
 * Executes multiple analyzers concurrently with:
 * - Priority-based ordering
 * - Timeout management
 * - Partial results handling
 * - Progress tracking
 */

import PQueue from 'p-queue';
import type { ResourceAnalyzer, MLResult, AnalysisOptions } from '../analyzers/types.js';
import { logger } from '../logging.js';

export interface ExecutionPlan {
  analyzers: ResourceAnalyzer[];
  regions: string[];
  maxConcurrency: number;
  totalTimeout: number;
}

export interface ExecutionProgress {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  currentAnalyzer: string | null;
  currentRegion: string | null;
  elapsedTime: number;
  estimatedTimeRemaining: number;
}

export interface ExecutionResult {
  results: MLResult[];
  progress: ExecutionProgress;
  errors: Array<{ analyzer: string; region: string; error: string }>;
  partialResults: boolean;
}

export class ParallelExecutor {
  private queue: PQueue;
  private progress: ExecutionProgress;
  private startTime: number = 0;
  private errors: Array<{ analyzer: string; region: string; error: string }> = [];

  constructor(maxConcurrency: number = 5) {
    this.queue = new PQueue({ concurrency: maxConcurrency });
    this.progress = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      currentAnalyzer: null,
      currentRegion: null,
      elapsedTime: 0,
      estimatedTimeRemaining: 0,
    };
  }

  /**
   * Create execution plan based on analyzers and regions
   */
  createExecutionPlan(
    analyzers: ResourceAnalyzer[],
    regions: string[],
    totalTimeout: number
  ): ExecutionPlan {
    // Sort analyzers by priority (higher priority first)
    const sortedAnalyzers = [...analyzers].sort((a, b) => b.priority - a.priority);

    return {
      analyzers: sortedAnalyzers,
      regions,
      maxConcurrency: Math.min(5, regions.length),
      totalTimeout,
    };
  }

  /**
   * Execute analysis plan in parallel
   */
  async execute(
    plan: ExecutionPlan,
    credentials: any,
    accountId: string,
    options: AnalysisOptions
  ): Promise<ExecutionResult> {
    this.startTime = Date.now();
    this.errors = [];
    const allResults: MLResult[] = [];

    // Calculate total tasks
    this.progress.totalTasks = plan.analyzers.length * plan.regions.length;
    this.progress.completedTasks = 0;
    this.progress.failedTasks = 0;

    logger.info('Starting parallel execution', {
      analyzers: plan.analyzers.map(a => a.serviceName),
      regions: plan.regions,
      totalTasks: this.progress.totalTasks,
      maxConcurrency: plan.maxConcurrency,
    });

    // Create tasks for each analyzer-region combination
    const tasks: Array<() => Promise<MLResult[]>> = [];

    for (const analyzer of plan.analyzers) {
      for (const region of plan.regions) {
        tasks.push(async () => {
          const taskStartTime = Date.now();
          const remainingTime = plan.totalTimeout - (Date.now() - this.startTime);

          if (remainingTime < 2000) {
            logger.warn('Skipping task due to timeout', {
              analyzer: analyzer.serviceName,
              region,
            });
            return [];
          }

          this.progress.currentAnalyzer = analyzer.serviceName;
          this.progress.currentRegion = region;

          try {
            const results = await analyzer.analyze(
              credentials,
              region,
              accountId,
              {
                ...options,
                remainingTime: Math.min(remainingTime, analyzer.getEstimatedDuration() * 2),
              }
            );

            this.progress.completedTasks++;
            this.updateProgress();

            logger.info('Analyzer completed', {
              analyzer: analyzer.serviceName,
              region,
              resultsCount: results.length,
              duration: Date.now() - taskStartTime,
            });

            return results;
          } catch (error) {
            this.progress.failedTasks++;
            this.errors.push({
              analyzer: analyzer.serviceName,
              region,
              error: (error as Error).message,
            });

            logger.error('Analyzer failed', error as Error, {
              analyzer: analyzer.serviceName,
              region,
            });

            return [];
          }
        });
      }
    }

    // Execute tasks with concurrency limit
    const taskResults = await Promise.all(
      tasks.map(task => this.queue.add(task))
    );

    // Flatten results
    for (const results of taskResults) {
      if (results) {
        allResults.push(...results);
      }
    }

    // Final progress update
    this.progress.elapsedTime = Date.now() - this.startTime;
    this.progress.estimatedTimeRemaining = 0;
    this.progress.currentAnalyzer = null;
    this.progress.currentRegion = null;

    const partialResults = this.progress.failedTasks > 0 || 
      this.progress.completedTasks < this.progress.totalTasks;

    logger.info('Parallel execution completed', {
      totalResults: allResults.length,
      completedTasks: this.progress.completedTasks,
      failedTasks: this.progress.failedTasks,
      elapsedTime: this.progress.elapsedTime,
      partialResults,
    });

    return {
      results: allResults,
      progress: { ...this.progress },
      errors: this.errors,
      partialResults,
    };
  }

  private updateProgress(): void {
    const elapsed = Date.now() - this.startTime;
    const completed = this.progress.completedTasks + this.progress.failedTasks;
    const remaining = this.progress.totalTasks - completed;

    if (completed > 0) {
      const avgTimePerTask = elapsed / completed;
      this.progress.estimatedTimeRemaining = avgTimePerTask * remaining;
    }

    this.progress.elapsedTime = elapsed;
  }

  /**
   * Get current progress
   */
  getProgress(): ExecutionProgress {
    return { ...this.progress };
  }

  /**
   * Cancel all pending tasks
   */
  cancel(): void {
    this.queue.clear();
    logger.info('Parallel execution cancelled');
  }
}

/**
 * Analyzer Registry - manages available analyzers
 */
export class AnalyzerRegistry {
  private analyzers: Map<string, ResourceAnalyzer> = new Map();

  register(analyzer: ResourceAnalyzer): void {
    this.analyzers.set(analyzer.serviceCode, analyzer);
    logger.info('Analyzer registered', { 
      service: analyzer.serviceName,
      code: analyzer.serviceCode,
      priority: analyzer.priority,
    });
  }

  get(serviceCode: string): ResourceAnalyzer | undefined {
    return this.analyzers.get(serviceCode);
  }

  getAll(): ResourceAnalyzer[] {
    return Array.from(this.analyzers.values());
  }

  getByPriority(minPriority: number = 0): ResourceAnalyzer[] {
    return this.getAll()
      .filter(a => a.priority >= minPriority)
      .sort((a, b) => b.priority - a.priority);
  }

  getSupportedServices(): string[] {
    return Array.from(this.analyzers.keys());
  }
}

// Global registry instance
export const analyzerRegistry = new AnalyzerRegistry();
```



---

## 7. Dynamic Pricing Service

### File: `backend/src/lib/pricing/dynamic-pricing-service.ts`

```typescript
/**
 * Dynamic Pricing Service
 * 
 * Fetches real-time pricing from AWS Pricing API with:
 * - Regional price variations
 * - Caching (24h TTL)
 * - Fallback to static prices
 */

import { 
  PricingClient, 
  GetProductsCommand,
  DescribeServicesCommand,
} from '@aws-sdk/client-pricing';
import { logger } from '../logging.js';

// Static fallback prices (us-east-1)
import { EC2_PRICING, RDS_PRICING, LAMBDA_PRICING } from '../cost/pricing.js';

interface PriceCache {
  price: number;
  timestamp: number;
  region: string;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const priceCache: Map<string, PriceCache> = new Map();

export class DynamicPricingService {
  private pricingClient: PricingClient;
  private enabled: boolean = true;

  constructor(credentials?: any) {
    // Pricing API is only available in us-east-1 and ap-south-1
    this.pricingClient = new PricingClient({ 
      region: 'us-east-1',
      credentials,
    });
  }

  /**
   * Get EC2 instance hourly price
   */
  async getEC2Price(instanceType: string, region: string): Promise<number> {
    const cacheKey = `ec2:${instanceType}:${region}`;
    
    // Check cache
    const cached = this.getCachedPrice(cacheKey);
    if (cached !== null) return cached;

    try {
      const response = await this.pricingClient.send(new GetProductsCommand({
        ServiceCode: 'AmazonEC2',
        Filters: [
          { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
          { Type: 'TERM_MATCH', Field: 'location', Value: this.regionToLocation(region) },
          { Type: 'TERM_MATCH', Field: 'operatingSystem', Value: 'Linux' },
          { Type: 'TERM_MATCH', Field: 'tenancy', Value: 'Shared' },
          { Type: 'TERM_MATCH', Field: 'preInstalledSw', Value: 'NA' },
          { Type: 'TERM_MATCH', Field: 'capacitystatus', Value: 'Used' },
        ],
        MaxResults: 1,
      }));

      const price = this.extractOnDemandPrice(response.PriceList?.[0]);
      
      if (price !== null) {
        this.setCachedPrice(cacheKey, price, region);
        return price;
      }
    } catch (error) {
      logger.warn('Failed to fetch EC2 price from API', { 
        instanceType, 
        region,
        error: (error as Error).message,
      });
    }

    // Fallback to static price
    return EC2_PRICING[instanceType] || EC2_PRICING[instanceType.toLowerCase()] || 0.05;
  }

  /**
   * Get RDS instance hourly price
   */
  async getRDSPrice(instanceClass: string, engine: string, region: string): Promise<number> {
    const cacheKey = `rds:${instanceClass}:${engine}:${region}`;
    
    const cached = this.getCachedPrice(cacheKey);
    if (cached !== null) return cached;

    try {
      const response = await this.pricingClient.send(new GetProductsCommand({
        ServiceCode: 'AmazonRDS',
        Filters: [
          { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceClass },
          { Type: 'TERM_MATCH', Field: 'location', Value: this.regionToLocation(region) },
          { Type: 'TERM_MATCH', Field: 'databaseEngine', Value: this.normalizeEngine(engine) },
          { Type: 'TERM_MATCH', Field: 'deploymentOption', Value: 'Single-AZ' },
        ],
        MaxResults: 1,
      }));

      const price = this.extractOnDemandPrice(response.PriceList?.[0]);
      
      if (price !== null) {
        this.setCachedPrice(cacheKey, price, region);
        return price;
      }
    } catch (error) {
      logger.warn('Failed to fetch RDS price from API', { 
        instanceClass, 
        engine,
        region,
        error: (error as Error).message,
      });
    }

    return RDS_PRICING[instanceClass] || RDS_PRICING[instanceClass.toLowerCase()] || 0.05;
  }

  /**
   * Get S3 storage price per GB/month
   */
  async getS3Price(storageClass: string, region: string): Promise<number> {
    const cacheKey = `s3:${storageClass}:${region}`;
    
    const cached = this.getCachedPrice(cacheKey);
    if (cached !== null) return cached;

    const staticPrices: Record<string, number> = {
      'STANDARD': 0.023,
      'INTELLIGENT_TIERING': 0.023,
      'STANDARD_IA': 0.0125,
      'ONEZONE_IA': 0.01,
      'GLACIER_IR': 0.004,
      'GLACIER': 0.004,
      'DEEP_ARCHIVE': 0.00099,
    };

    try {
      const response = await this.pricingClient.send(new GetProductsCommand({
        ServiceCode: 'AmazonS3',
        Filters: [
          { Type: 'TERM_MATCH', Field: 'location', Value: this.regionToLocation(region) },
          { Type: 'TERM_MATCH', Field: 'storageClass', Value: storageClass },
          { Type: 'TERM_MATCH', Field: 'volumeType', Value: 'Standard' },
        ],
        MaxResults: 1,
      }));

      const price = this.extractOnDemandPrice(response.PriceList?.[0]);
      
      if (price !== null) {
        this.setCachedPrice(cacheKey, price, region);
        return price;
      }
    } catch (error) {
      logger.warn('Failed to fetch S3 price from API', { 
        storageClass, 
        region,
        error: (error as Error).message,
      });
    }

    return staticPrices[storageClass] || 0.023;
  }

  /**
   * Get DynamoDB pricing
   */
  async getDynamoDBPrice(
    billingMode: 'PROVISIONED' | 'PAY_PER_REQUEST',
    region: string
  ): Promise<{
    readUnit: number;
    writeUnit: number;
    storagePerGB: number;
  }> {
    const cacheKey = `dynamodb:${billingMode}:${region}`;
    
    // DynamoDB pricing is complex, use static for now
    if (billingMode === 'PROVISIONED') {
      return {
        readUnit: 0.00013,  // per RCU per hour
        writeUnit: 0.00065, // per WCU per hour
        storagePerGB: 0.25,
      };
    } else {
      return {
        readUnit: 0.00000025,  // per RRU
        writeUnit: 0.00000125, // per WRU
        storagePerGB: 0.25,
      };
    }
  }

  /**
   * Get NAT Gateway pricing
   */
  async getNATGatewayPrice(region: string): Promise<{
    hourlyRate: number;
    dataProcessingPerGB: number;
  }> {
    // NAT Gateway pricing is consistent across regions
    return {
      hourlyRate: 0.045,
      dataProcessingPerGB: 0.045,
    };
  }

  /**
   * Get Lambda pricing
   */
  async getLambdaPrice(region: string): Promise<{
    requestCost: number;
    durationCostPerGBSecond: number;
  }> {
    return {
      requestCost: LAMBDA_PRICING.requestCost,
      durationCostPerGBSecond: LAMBDA_PRICING.durationCostPerGBSecond,
    };
  }

  /**
   * Calculate monthly cost for a resource
   */
  async calculateMonthlyCost(
    service: string,
    resourceType: string,
    size: string,
    region: string,
    additionalParams?: Record<string, any>
  ): Promise<number> {
    const hoursPerMonth = 730;

    switch (service.toLowerCase()) {
      case 'ec2':
        const ec2Price = await this.getEC2Price(size, region);
        return ec2Price * hoursPerMonth;

      case 'rds':
        const rdsPrice = await this.getRDSPrice(
          size, 
          additionalParams?.engine || 'PostgreSQL',
          region
        );
        return rdsPrice * hoursPerMonth;

      case 's3':
        const s3Price = await this.getS3Price(
          additionalParams?.storageClass || 'STANDARD',
          region
        );
        const sizeGB = additionalParams?.sizeGB || 0;
        return s3Price * sizeGB;

      case 'dynamodb':
        const ddbPrice = await this.getDynamoDBPrice(
          additionalParams?.billingMode || 'PROVISIONED',
          region
        );
        const rcu = additionalParams?.rcu || 0;
        const wcu = additionalParams?.wcu || 0;
        const storageGB = additionalParams?.storageGB || 0;
        return (rcu * ddbPrice.readUnit * hoursPerMonth) +
               (wcu * ddbPrice.writeUnit * hoursPerMonth) +
               (storageGB * ddbPrice.storagePerGB);

      case 'nat-gateway':
        const natPrice = await this.getNATGatewayPrice(region);
        const dataGB = additionalParams?.dataGB || 0;
        return (natPrice.hourlyRate * hoursPerMonth) + (natPrice.dataProcessingPerGB * dataGB);

      case 'lambda':
        const lambdaPrice = await this.getLambdaPrice(region);
        const invocations = additionalParams?.invocations || 0;
        const durationMs = additionalParams?.durationMs || 0;
        const memoryMB = additionalParams?.memoryMB || 128;
        const gbSeconds = (invocations * durationMs / 1000) * (memoryMB / 1024);
        return (invocations * lambdaPrice.requestCost) + 
               (gbSeconds * lambdaPrice.durationCostPerGBSecond);

      default:
        return 0;
    }
  }

  // Helper methods

  private getCachedPrice(key: string): number | null {
    const cached = priceCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.price;
    }
    return null;
  }

  private setCachedPrice(key: string, price: number, region: string): void {
    priceCache.set(key, {
      price,
      timestamp: Date.now(),
      region,
    });
  }

  private extractOnDemandPrice(priceListItem: string | undefined): number | null {
    if (!priceListItem) return null;

    try {
      const product = JSON.parse(priceListItem);
      const terms = product.terms?.OnDemand;
      
      if (!terms) return null;

      // Get first term
      const termKey = Object.keys(terms)[0];
      const term = terms[termKey];
      
      // Get first price dimension
      const priceDimensionKey = Object.keys(term.priceDimensions)[0];
      const priceDimension = term.priceDimensions[priceDimensionKey];
      
      return parseFloat(priceDimension.pricePerUnit.USD);
    } catch {
      return null;
    }
  }

  private regionToLocation(region: string): string {
    const regionMap: Record<string, string> = {
      'us-east-1': 'US East (N. Virginia)',
      'us-east-2': 'US East (Ohio)',
      'us-west-1': 'US West (N. California)',
      'us-west-2': 'US West (Oregon)',
      'eu-west-1': 'EU (Ireland)',
      'eu-west-2': 'EU (London)',
      'eu-west-3': 'EU (Paris)',
      'eu-central-1': 'EU (Frankfurt)',
      'eu-north-1': 'EU (Stockholm)',
      'ap-northeast-1': 'Asia Pacific (Tokyo)',
      'ap-northeast-2': 'Asia Pacific (Seoul)',
      'ap-southeast-1': 'Asia Pacific (Singapore)',
      'ap-southeast-2': 'Asia Pacific (Sydney)',
      'ap-south-1': 'Asia Pacific (Mumbai)',
      'sa-east-1': 'South America (Sao Paulo)',
      'ca-central-1': 'Canada (Central)',
    };
    return regionMap[region] || 'US East (N. Virginia)';
  }

  private normalizeEngine(engine: string): string {
    const engineMap: Record<string, string> = {
      'postgres': 'PostgreSQL',
      'postgresql': 'PostgreSQL',
      'mysql': 'MySQL',
      'mariadb': 'MariaDB',
      'oracle': 'Oracle',
      'sqlserver': 'SQL Server',
      'aurora': 'Aurora MySQL',
      'aurora-mysql': 'Aurora MySQL',
      'aurora-postgresql': 'Aurora PostgreSQL',
    };
    return engineMap[engine.toLowerCase()] || engine;
  }

  /**
   * Clear price cache
   */
  clearCache(): void {
    priceCache.clear();
    logger.info('Price cache cleared');
  }

  /**
   * Disable dynamic pricing (use static only)
   */
  disable(): void {
    this.enabled = false;
    logger.info('Dynamic pricing disabled');
  }

  /**
   * Enable dynamic pricing
   */
  enable(): void {
    this.enabled = true;
    logger.info('Dynamic pricing enabled');
  }
}

// Singleton instance
export const pricingService = new DynamicPricingService();
```



---

## 8. ML Models

### 8.1 Usage Forecaster

### File: `backend/src/lib/ml-models/usage-forecaster.ts`

```typescript
/**
 * Usage Forecaster
 * 
 * Predicts future resource usage using time series analysis:
 * - Trend detection (increasing/decreasing/stable)
 * - Simple moving average forecasting
 * - Confidence intervals
 */

export interface ForecastResult {
  predictedValue: number;
  confidenceInterval: { lower: number; upper: number };
  trend: 'increasing' | 'stable' | 'decreasing';
  trendStrength: number; // 0-1
  forecastHorizon: number; // days
}

export interface TimeSeriesDatapoint {
  timestamp: Date;
  value: number;
}

export class UsageForecaster {
  private windowSize: number;

  constructor(windowSize: number = 7) {
    this.windowSize = windowSize;
  }

  /**
   * Forecast future usage based on historical data
   */
  forecast(
    data: TimeSeriesDatapoint[],
    horizonDays: number = 7
  ): ForecastResult {
    if (data.length < 3) {
      return {
        predictedValue: data.length > 0 ? data[data.length - 1].value : 0,
        confidenceInterval: { lower: 0, upper: 0 },
        trend: 'stable',
        trendStrength: 0,
        forecastHorizon: horizonDays,
      };
    }

    // Sort by timestamp
    const sortedData = [...data].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Calculate trend using linear regression
    const { slope, intercept, r2 } = this.linearRegression(sortedData);

    // Determine trend direction
    let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    const avgValue = sortedData.reduce((sum, d) => sum + d.value, 0) / sortedData.length;
    const slopeThreshold = avgValue * 0.01; // 1% change per day

    if (slope > slopeThreshold) {
      trend = 'increasing';
    } else if (slope < -slopeThreshold) {
      trend = 'decreasing';
    }

    // Predict future value
    const lastTimestamp = sortedData[sortedData.length - 1].timestamp.getTime();
    const futureTimestamp = lastTimestamp + horizonDays * 24 * 60 * 60 * 1000;
    const daysSinceStart = (futureTimestamp - sortedData[0].timestamp.getTime()) / (24 * 60 * 60 * 1000);
    
    const predictedValue = Math.max(0, intercept + slope * daysSinceStart);

    // Calculate confidence interval using standard error
    const residuals = sortedData.map((d, i) => {
      const predicted = intercept + slope * i;
      return d.value - predicted;
    });
    const stdError = Math.sqrt(
      residuals.reduce((sum, r) => sum + r * r, 0) / (residuals.length - 2)
    );

    const confidenceMultiplier = 1.96; // 95% confidence
    const confidenceInterval = {
      lower: Math.max(0, predictedValue - confidenceMultiplier * stdError),
      upper: predictedValue + confidenceMultiplier * stdError,
    };

    return {
      predictedValue,
      confidenceInterval,
      trend,
      trendStrength: Math.min(1, Math.abs(r2)),
      forecastHorizon: horizonDays,
    };
  }

  /**
   * Calculate moving average
   */
  movingAverage(data: TimeSeriesDatapoint[], window: number = this.windowSize): number[] {
    const values = data.map(d => d.value);
    const result: number[] = [];

    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - window + 1);
      const windowValues = values.slice(start, i + 1);
      const avg = windowValues.reduce((a, b) => a + b, 0) / windowValues.length;
      result.push(avg);
    }

    return result;
  }

  /**
   * Detect if usage is trending towards zero (idle)
   */
  isApproachingIdle(data: TimeSeriesDatapoint[], threshold: number = 5): boolean {
    const forecast = this.forecast(data, 14);
    return forecast.trend === 'decreasing' && 
           forecast.predictedValue < threshold &&
           forecast.trendStrength > 0.5;
  }

  /**
   * Detect if usage is spiking
   */
  detectSpike(data: TimeSeriesDatapoint[], stdDevMultiplier: number = 2): boolean {
    if (data.length < 5) return false;

    const values = data.map(d => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );

    const lastValue = values[values.length - 1];
    return lastValue > mean + stdDevMultiplier * stdDev;
  }

  // Private helper methods

  private linearRegression(data: TimeSeriesDatapoint[]): {
    slope: number;
    intercept: number;
    r2: number;
  } {
    const n = data.length;
    const x = data.map((_, i) => i);
    const y = data.map(d => d.value);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    const yMean = sumY / n;
    const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const ssResidual = y.reduce((sum, yi, i) => {
      const predicted = intercept + slope * x[i];
      return sum + Math.pow(yi - predicted, 2);
    }, 0);
    const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

    return { slope, intercept, r2 };
  }
}
```

### 8.2 Risk Classifier

### File: `backend/src/lib/ml-models/risk-classifier.ts`

```typescript
/**
 * Risk Classifier
 * 
 * Ensemble model that combines multiple signals to classify
 * the risk level of implementing a recommendation.
 */

import type { UtilizationPatterns, ResourceDependency } from '../analyzers/types.js';

export interface RiskSignals {
  utilizationRisk: number;      // 0-1: Risk based on current utilization
  trendRisk: number;            // 0-1: Risk based on usage trend
  seasonalityRisk: number;      // 0-1: Risk based on seasonal patterns
  stabilityRisk: number;        // 0-1: Risk based on usage stability
  dependencyRisk: number;       // 0-1: Risk based on resource dependencies
  dataQualityRisk: number;      // 0-1: Risk based on data completeness
}

export interface RiskClassification {
  level: 'low' | 'medium' | 'high';
  score: number;                // 0-1
  signals: RiskSignals;
  reasoning: string[];
  mitigations: string[];
}

export class RiskClassifier {
  // Signal weights for ensemble
  private weights = {
    utilization: 0.25,
    trend: 0.15,
    seasonality: 0.15,
    stability: 0.20,
    dependency: 0.15,
    dataQuality: 0.10,
  };

  /**
   * Classify risk for a recommendation
   */
  classify(
    recommendationType: 'terminate' | 'downsize' | 'auto-scale' | 'optimize' | 'migrate',
    patterns: UtilizationPatterns,
    dependencies: ResourceDependency[],
    resourceMetadata: Record<string, any>
  ): RiskClassification {
    // Calculate individual risk signals
    const signals = this.calculateSignals(
      recommendationType,
      patterns,
      dependencies,
      resourceMetadata
    );

    // Calculate weighted ensemble score
    const score = 
      signals.utilizationRisk * this.weights.utilization +
      signals.trendRisk * this.weights.trend +
      signals.seasonalityRisk * this.weights.seasonality +
      signals.stabilityRisk * this.weights.stability +
      signals.dependencyRisk * this.weights.dependency +
      signals.dataQualityRisk * this.weights.dataQuality;

    // Determine risk level
    let level: 'low' | 'medium' | 'high';
    if (score < 0.3) {
      level = 'low';
    } else if (score < 0.6) {
      level = 'medium';
    } else {
      level = 'high';
    }

    // Generate reasoning and mitigations
    const { reasoning, mitigations } = this.generateExplanation(
      recommendationType,
      signals,
      level
    );

    return {
      level,
      score,
      signals,
      reasoning,
      mitigations,
    };
  }

  private calculateSignals(
    recommendationType: string,
    patterns: UtilizationPatterns,
    dependencies: ResourceDependency[],
    metadata: Record<string, any>
  ): RiskSignals {
    // Utilization Risk
    // Higher utilization = higher risk for terminate/downsize
    let utilizationRisk = 0;
    if (recommendationType === 'terminate') {
      utilizationRisk = Math.min(1, patterns.avgCpuUsage / 50);
    } else if (recommendationType === 'downsize') {
      utilizationRisk = Math.min(1, patterns.maxCpuUsage / 80);
    } else {
      utilizationRisk = 0.2; // Low base risk for other actions
    }

    // Trend Risk
    // Increasing trend = higher risk for terminate/downsize
    let trendRisk = 0;
    if (patterns.trend === 'increasing') {
      trendRisk = recommendationType === 'terminate' ? 0.8 : 0.5;
    } else if (patterns.trend === 'decreasing') {
      trendRisk = 0.1;
    } else {
      trendRisk = 0.3;
    }

    // Seasonality Risk
    // Strong seasonality = higher risk (might miss peak periods)
    let seasonalityRisk = 0;
    if (patterns.peakHours.length > 0 && patterns.peakHours.length < 12) {
      seasonalityRisk = 0.4; // Clear peak pattern
    } else if (patterns.seasonality === 'weekly') {
      seasonalityRisk = 0.5;
    } else {
      seasonalityRisk = 0.2;
    }

    // Stability Risk
    // High variance = higher risk
    const cpuVariance = patterns.maxCpuUsage - patterns.avgCpuUsage;
    const stabilityRisk = Math.min(1, cpuVariance / 50);

    // Dependency Risk
    // More dependencies = higher risk
    const dependencyRisk = Math.min(1, dependencies.length * 0.2);

    // Data Quality Risk
    // Less data = higher risk
    const dataQualityRisk = 1 - patterns.dataCompleteness;

    return {
      utilizationRisk,
      trendRisk,
      seasonalityRisk,
      stabilityRisk,
      dependencyRisk,
      dataQualityRisk,
    };
  }

  private generateExplanation(
    recommendationType: string,
    signals: RiskSignals,
    level: 'low' | 'medium' | 'high'
  ): { reasoning: string[]; mitigations: string[] } {
    const reasoning: string[] = [];
    const mitigations: string[] = [];

    // Utilization reasoning
    if (signals.utilizationRisk > 0.5) {
      reasoning.push('Current utilization is moderate to high');
      mitigations.push('Monitor for 24-48 hours before implementing');
    }

    // Trend reasoning
    if (signals.trendRisk > 0.5) {
      reasoning.push('Usage trend is increasing');
      mitigations.push('Consider waiting for trend to stabilize');
    }

    // Seasonality reasoning
    if (signals.seasonalityRisk > 0.3) {
      reasoning.push('Resource shows seasonal usage patterns');
      mitigations.push('Implement during off-peak hours');
    }

    // Stability reasoning
    if (signals.stabilityRisk > 0.5) {
      reasoning.push('Usage is highly variable');
      mitigations.push('Consider auto-scaling instead of fixed sizing');
    }

    // Dependency reasoning
    if (signals.dependencyRisk > 0.3) {
      reasoning.push('Resource has dependencies that may be affected');
      mitigations.push('Review dependent resources before changes');
    }

    // Data quality reasoning
    if (signals.dataQualityRisk > 0.3) {
      reasoning.push('Limited historical data available');
      mitigations.push('Collect more data before making changes');
    }

    // Add general mitigations based on level
    if (level === 'high') {
      mitigations.push('Create backup/snapshot before implementing');
      mitigations.push('Have rollback plan ready');
      mitigations.push('Implement during maintenance window');
    } else if (level === 'medium') {
      mitigations.push('Monitor closely after implementation');
    }

    return { reasoning, mitigations };
  }

  /**
   * Adjust weights for specific use cases
   */
  setWeights(newWeights: Partial<typeof this.weights>): void {
    this.weights = { ...this.weights, ...newWeights };
    
    // Normalize weights to sum to 1
    const total = Object.values(this.weights).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(this.weights) as Array<keyof typeof this.weights>) {
      this.weights[key] /= total;
    }
  }
}

// Singleton instance
export const riskClassifier = new RiskClassifier();
```

---

## 9. Updated ML Handler Integration

### File: `backend/src/handlers/cost/ml-waste-detection.ts` (Updated)

```typescript
// Key changes to integrate new components:

import { ParallelExecutor, analyzerRegistry } from '../../lib/execution/parallel-executor.js';
import { S3BucketAnalyzer } from '../../lib/analyzers/storage/s3-bucket-analyzer.js';
import { NATGatewayAnalyzer } from '../../lib/analyzers/network/nat-gateway-analyzer.js';
import { DynamoDBTableAnalyzer } from '../../lib/analyzers/database/dynamodb-table-analyzer.js';
import { pricingService } from '../../lib/pricing/dynamic-pricing-service.js';
import { riskClassifier } from '../../lib/ml-models/risk-classifier.js';
import { buildResourceArn } from '../../lib/ml-analysis/arn-builder.js';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

// Register analyzers on module load
analyzerRegistry.register(new S3BucketAnalyzer());
analyzerRegistry.register(new NATGatewayAnalyzer());
analyzerRegistry.register(new DynamoDBTableAnalyzer());
// ... register other analyzers

export async function handler(event, context) {
  // ... existing setup code ...

  // Get AWS account number
  const stsClient = new STSClient({ region: 'us-east-1', credentials });
  const identity = await stsClient.send(new GetCallerIdentityCommand({}));
  const accountNumber = identity.Account!;

  // Create parallel executor
  const executor = new ParallelExecutor(5);

  // Get analyzers based on analysis depth
  const analyzers = analysisDepth === 'deep'
    ? analyzerRegistry.getAll()
    : analyzerRegistry.getByPriority(2);

  // Create execution plan
  const plan = executor.createExecutionPlan(
    analyzers,
    regions,
    MAX_EXECUTION_TIME
  );

  // Execute analysis
  const executionResult = await executor.execute(
    plan,
    credentials,
    accountNumber,
    { maxResources, analysisDepth }
  );

  // Enrich results with risk classification
  const enrichedResults = executionResult.results.map(result => ({
    ...result,
    riskClassification: riskClassifier.classify(
      result.recommendationType,
      result.utilizationPatterns,
      result.dependencies,
      result.resourceMetadata
    ),
  }));

  // ... rest of handler ...
}
```

---

## 10. Frontend Updates

### Key Changes to `src/pages/MLWasteDetection.tsx`

```tsx
// Add ARN display and copy functionality
<div className="flex items-center gap-2">
  <span className="text-xs text-muted-foreground font-mono truncate max-w-[300px]">
    {rec.resource_arn}
  </span>
  <Button
    variant="ghost"
    size="sm"
    onClick={() => {
      navigator.clipboard.writeText(rec.resource_arn);
      toast({ title: "ARN copied to clipboard" });
    }}
  >
    <Copy className="h-3 w-3" />
  </Button>
  {rec.resource_arn && (
    <a
      href={getConsoleUrl(rec.resource_arn)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      <ExternalLink className="h-3 w-3" />
    </a>
  )}
</div>

// Add risk assessment display
{rec.risk_assessment && (
  <Badge variant={
    rec.risk_assessment === 'high' ? 'destructive' :
    rec.risk_assessment === 'medium' ? 'secondary' : 'outline'
  }>
    {rec.risk_assessment} risk
  </Badge>
)}

// Add implementation steps accordion
{rec.implementation_steps && (
  <Accordion type="single" collapsible>
    <AccordionItem value="steps">
      <AccordionTrigger>Implementation Steps</AccordionTrigger>
      <AccordionContent>
        <ol className="space-y-2">
          {rec.implementation_steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <Badge variant={
                step.riskLevel === 'destructive' ? 'destructive' :
                step.riskLevel === 'review' ? 'secondary' : 'outline'
              }>
                {i + 1}
              </Badge>
              <div>
                <p className="font-medium">{step.action}</p>
                {step.command && (
                  <code className="text-xs bg-muted p-1 rounded block mt-1">
                    {step.command}
                  </code>
                )}
              </div>
            </li>
          ))}
        </ol>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
)}
```

---

## References

- #[[file:backend/src/handlers/cost/ml-waste-detection.ts]]
- #[[file:backend/src/lib/ml-analysis/waste-analyzer.ts]]
- #[[file:backend/src/lib/cost/pricing.ts]]
- #[[file:backend/prisma/schema.prisma]]
- #[[file:src/pages/MLWasteDetection.tsx]]
- #[[file:.kiro/specs/ml-waste-detection-v3/requirements.md]]
- #[[file:.kiro/specs/ml-waste-detection-v3/tasks.md]]
