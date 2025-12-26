# ML-Powered Waste Detection 2.0 - Technical Design

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend (React)                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ MLWasteDetection│  │ Summary Cards   │  │ Recommendations List    │  │
│  │     Page        │  │ (Savings, etc)  │  │ (with patterns)         │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
│           │                    │                        │               │
│           └────────────────────┼────────────────────────┘               │
│                                │                                        │
│                    ┌───────────▼───────────┐                           │
│                    │   API Client          │                           │
│                    │   (invoke/select)     │                           │
│                    └───────────┬───────────┘                           │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    API Gateway          │
                    │    (Cognito Auth)       │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────▼────────┐   ┌─────────▼─────────┐   ┌────────▼────────┐
│ ml-waste-       │   │ query-table       │   │ fetch-cloudwatch│
│ detection       │   │ Lambda            │   │ -metrics Lambda │
│ Lambda          │   │                   │   │                 │
└────────┬────────┘   └─────────┬─────────┘   └────────┬────────┘
         │                      │                      │
         │            ┌─────────▼─────────┐            │
         │            │   PostgreSQL      │            │
         │            │   (RDS)           │◄───────────┘
         │            │                   │
         │            │ - resource_       │
         │            │   utilization_ml  │
         │            │ - waste_detections│
         │            │ - resource_metrics│
         │            └───────────────────┘
         │
         │            ┌───────────────────┐
         └───────────►│   AWS CloudWatch  │
                      │   (Metrics API)   │
                      └───────────────────┘
```

## Component Design

### 1. Database Schema (Prisma)

```prisma
// Add to backend/prisma/schema.prisma

model ResourceUtilizationML {
  id                      String   @id @default(uuid()) @db.Uuid
  organization_id         String   @db.Uuid
  aws_account_id          String   @db.Uuid
  resource_id             String
  resource_name           String?
  resource_type           String
  region                  String
  
  // Current state
  current_size            String?
  current_monthly_cost    Float?
  
  // ML Analysis results
  recommendation_type     String?  // 'terminate', 'downsize', 'auto-scale', 'optimize'
  recommended_size        String?
  potential_monthly_savings Float?
  ml_confidence           Float?   // 0.0 to 1.0
  
  // Utilization patterns (JSON)
  utilization_patterns    Json?
  
  // Auto-scaling configuration
  auto_scaling_eligible   Boolean  @default(false)
  auto_scaling_config     Json?
  
  // Metadata
  implementation_complexity String? // 'low', 'medium', 'high'
  analyzed_at             DateTime @default(now()) @db.Timestamptz(6)
  created_at              DateTime @default(now()) @db.Timestamptz(6)
  updated_at              DateTime @updatedAt @db.Timestamptz(6)
  
  @@unique([organization_id, aws_account_id, resource_id])
  @@index([organization_id])
  @@index([aws_account_id])
  @@index([recommendation_type])
  @@map("resource_utilization_ml")
}
```

### 2. ML Analysis Algorithm

```typescript
// backend/src/lib/ml-analysis/waste-analyzer.ts

interface UtilizationMetrics {
  avgCpu: number;
  maxCpu: number;
  minCpu: number;
  stdDevCpu: number;
  avgMemory: number;
  maxMemory: number;
  peakHours: number[];
  weekdayPattern: number[];
  dataCompleteness: number; // 0-1
}

interface MLRecommendation {
  type: 'terminate' | 'downsize' | 'auto-scale' | 'optimize';
  confidence: number;
  recommendedSize?: string;
  savings: number;
  autoScalingConfig?: AutoScalingConfig;
  complexity: 'low' | 'medium' | 'high';
}

function analyzeUtilization(metrics: CloudWatchDatapoint[]): UtilizationMetrics {
  // Calculate statistics
  const cpuValues = metrics.map(m => m.Average || 0);
  const avgCpu = mean(cpuValues);
  const maxCpu = Math.max(...cpuValues);
  const minCpu = Math.min(...cpuValues);
  const stdDevCpu = standardDeviation(cpuValues);
  
  // Identify peak hours (hours with above-average usage)
  const hourlyAvg = groupByHour(metrics);
  const peakHours = Object.entries(hourlyAvg)
    .filter(([_, avg]) => avg > avgCpu * 1.2)
    .map(([hour]) => parseInt(hour));
  
  // Calculate weekday pattern
  const weekdayPattern = calculateWeekdayPattern(metrics);
  
  // Data completeness (expected vs actual datapoints)
  const expectedDatapoints = 7 * 24 * 12; // 7 days, 5-min intervals
  const dataCompleteness = metrics.length / expectedDatapoints;
  
  return {
    avgCpu, maxCpu, minCpu, stdDevCpu,
    avgMemory: 0, maxMemory: 0, // Calculated separately
    peakHours, weekdayPattern, dataCompleteness
  };
}

function classifyWaste(
  metrics: UtilizationMetrics,
  resourceType: string,
  currentSize: string
): MLRecommendation {
  // Rule-based classification with confidence scoring
  
  // TERMINATE: Very low usage, no activity
  if (metrics.avgCpu < 1 && metrics.maxCpu < 5) {
    return {
      type: 'terminate',
      confidence: calculateConfidence(metrics, 0.95),
      savings: getCurrentCost(resourceType, currentSize),
      complexity: 'low'
    };
  }
  
  // DOWNSIZE: Consistently low usage
  if (metrics.avgCpu < 30 && metrics.maxCpu < 60 && metrics.stdDevCpu < 15) {
    const recommendedSize = getDownsizeRecommendation(resourceType, currentSize, metrics.maxCpu);
    const currentCost = getCurrentCost(resourceType, currentSize);
    const newCost = getCurrentCost(resourceType, recommendedSize);
    
    return {
      type: 'downsize',
      confidence: calculateConfidence(metrics, 0.85),
      recommendedSize,
      savings: currentCost - newCost,
      complexity: 'medium'
    };
  }
  
  // AUTO-SCALE: High variance, predictable patterns
  if (metrics.stdDevCpu > 20 && metrics.peakHours.length > 0) {
    const autoScalingConfig = calculateAutoScalingConfig(metrics);
    const currentCost = getCurrentCost(resourceType, currentSize);
    const estimatedSavings = currentCost * 0.3; // Estimate 30% savings
    
    return {
      type: 'auto-scale',
      confidence: calculateConfidence(metrics, 0.75),
      savings: estimatedSavings,
      autoScalingConfig,
      complexity: 'high'
    };
  }
  
  // OPTIMIZE: Specific inefficiencies
  return {
    type: 'optimize',
    confidence: calculateConfidence(metrics, 0.6),
    savings: 0,
    complexity: 'medium'
  };
}

function calculateConfidence(metrics: UtilizationMetrics, baseConfidence: number): number {
  // Adjust confidence based on data quality
  let confidence = baseConfidence;
  
  // Reduce confidence if data is incomplete
  confidence *= metrics.dataCompleteness;
  
  // Reduce confidence if high variance
  if (metrics.stdDevCpu > 30) {
    confidence *= 0.8;
  }
  
  return Math.max(0, Math.min(1, confidence));
}

function calculateAutoScalingConfig(metrics: UtilizationMetrics): AutoScalingConfig {
  // Calculate optimal auto-scaling parameters
  const targetCpu = Math.min(70, metrics.avgCpu + metrics.stdDevCpu);
  const minCapacity = 1;
  const maxCapacity = Math.ceil(metrics.maxCpu / targetCpu) + 1;
  
  return {
    min_capacity: minCapacity,
    max_capacity: maxCapacity,
    target_cpu: Math.round(targetCpu),
    scale_in_cooldown: 300,
    scale_out_cooldown: 60
  };
}
```

### 3. Lambda Handler Design

```typescript
// backend/src/handlers/cost/ml-waste-detection.ts (updated)

export async function handler(event: AuthorizedEvent): Promise<APIGatewayProxyResultV2> {
  const MAX_EXECUTION_TIME = 25000;
  const startTime = Date.now();
  
  // 1. Parse request
  const { accountId, regions = ['us-east-1'] } = parseBody(event);
  
  // 2. Get AWS credentials
  const account = await getAwsCredentials(organizationId, accountId);
  
  // 3. Analyze resources by type
  const recommendations: MLRecommendation[] = [];
  
  for (const region of regions) {
    if (Date.now() - startTime > MAX_EXECUTION_TIME) break;
    
    // EC2 Analysis
    const ec2Results = await analyzeEC2Instances(account, region);
    recommendations.push(...ec2Results);
    
    // RDS Analysis
    const rdsResults = await analyzeRDSInstances(account, region);
    recommendations.push(...rdsResults);
    
    // Lambda Analysis
    const lambdaResults = await analyzeLambdaFunctions(account, region);
    recommendations.push(...lambdaResults);
  }
  
  // 4. Save to database
  await saveRecommendations(organizationId, accountId, recommendations);
  
  // 5. Return response
  return success({
    success: true,
    analyzed_resources: recommendations.length,
    total_monthly_savings: sumSavings(recommendations),
    recommendations,
    summary: generateSummary(recommendations)
  });
}

async function analyzeEC2Instances(account: AwsCredential, region: string): Promise<MLRecommendation[]> {
  const ec2Client = new EC2Client({ region, credentials: getCredentials(account) });
  const cwClient = new CloudWatchClient({ region, credentials: getCredentials(account) });
  
  // Get running instances
  const instances = await ec2Client.send(new DescribeInstancesCommand({
    Filters: [{ Name: 'instance-state-name', Values: ['running'] }],
    MaxResults: 50
  }));
  
  const recommendations: MLRecommendation[] = [];
  
  for (const instance of flattenInstances(instances)) {
    // Get 7-day CloudWatch metrics
    const metrics = await getCloudWatchMetrics(cwClient, 'AWS/EC2', 'CPUUtilization', {
      InstanceId: instance.InstanceId
    }, 7);
    
    // Analyze utilization
    const utilization = analyzeUtilization(metrics);
    
    // Classify and get recommendation
    const recommendation = classifyWaste(utilization, 'EC2', instance.InstanceType);
    
    recommendations.push({
      resourceId: instance.InstanceId,
      resourceName: getInstanceName(instance),
      resourceType: 'EC2::Instance',
      region,
      currentSize: instance.InstanceType,
      ...recommendation,
      utilizationPatterns: {
        avgCpuUsage: utilization.avgCpu,
        avgMemoryUsage: utilization.avgMemory,
        peakHours: utilization.peakHours,
        hasRealMetrics: true
      }
    });
  }
  
  return recommendations;
}
```

### 4. Cost Calculation Module

```typescript
// backend/src/lib/cost/pricing.ts

// EC2 On-Demand pricing (us-east-1, USD/hour)
const EC2_PRICING: Record<string, number> = {
  // T3 family
  't3.nano': 0.0052,
  't3.micro': 0.0104,
  't3.small': 0.0208,
  't3.medium': 0.0416,
  't3.large': 0.0832,
  't3.xlarge': 0.1664,
  't3.2xlarge': 0.3328,
  
  // M5 family
  'm5.large': 0.096,
  'm5.xlarge': 0.192,
  'm5.2xlarge': 0.384,
  'm5.4xlarge': 0.768,
  
  // C5 family
  'c5.large': 0.085,
  'c5.xlarge': 0.17,
  'c5.2xlarge': 0.34,
  
  // R5 family
  'r5.large': 0.126,
  'r5.xlarge': 0.252,
  'r5.2xlarge': 0.504,
};

// RDS pricing (us-east-1, USD/hour)
const RDS_PRICING: Record<string, number> = {
  'db.t3.micro': 0.017,
  'db.t3.small': 0.034,
  'db.t3.medium': 0.068,
  'db.m5.large': 0.171,
  'db.m5.xlarge': 0.342,
  'db.r5.large': 0.24,
};

export function getHourlyCost(resourceType: string, size: string): number {
  if (resourceType.includes('EC2')) {
    return EC2_PRICING[size] || 0.05;
  }
  if (resourceType.includes('RDS')) {
    return RDS_PRICING[size] || 0.05;
  }
  return 0.05;
}

export function getMonthlyCost(resourceType: string, size: string): number {
  return getHourlyCost(resourceType, size) * 730; // 730 hours/month
}

// Downsize mapping
const DOWNSIZE_MAP: Record<string, string> = {
  't3.2xlarge': 't3.xlarge',
  't3.xlarge': 't3.large',
  't3.large': 't3.medium',
  't3.medium': 't3.small',
  't3.small': 't3.micro',
  'm5.4xlarge': 'm5.2xlarge',
  'm5.2xlarge': 'm5.xlarge',
  'm5.xlarge': 'm5.large',
  'c5.2xlarge': 'c5.xlarge',
  'c5.xlarge': 'c5.large',
};

export function getDownsizeRecommendation(
  resourceType: string,
  currentSize: string,
  maxUtilization: number
): string {
  // If utilization is very low, recommend 2 sizes down
  if (maxUtilization < 20) {
    const oneDown = DOWNSIZE_MAP[currentSize];
    if (oneDown && DOWNSIZE_MAP[oneDown]) {
      return DOWNSIZE_MAP[oneDown];
    }
  }
  
  return DOWNSIZE_MAP[currentSize] || currentSize;
}
```

### 5. Query Table Lambda Update

```typescript
// Add to backend/src/handlers/data/query-table.ts

const TABLE_MAPPINGS: Record<string, string> = {
  // ... existing mappings
  'resource_utilization_ml': 'resourceUtilizationML',
};

// Add to switch statement
case 'resourceUtilizationML':
  data = await prisma.resourceUtilizationML.findMany({
    where: buildWhereClause(eq, organizationId),
    orderBy: buildOrderBy(order),
    take: limit,
    skip: offset,
  });
  break;
```

## API Endpoints

### POST /api/functions/ml-waste-detection

**Request:**
```json
{
  "accountId": "uuid",
  "regions": ["us-east-1", "us-west-2"],
  "analysisDepth": "standard" | "deep"
}
```

**Response:**
```json
{
  "success": true,
  "analyzed_resources": 45,
  "total_monthly_savings": 1250.50,
  "recommendations": [...],
  "summary": {
    "by_type": {
      "EC2": { "count": 20, "savings": 800 },
      "RDS": { "count": 5, "savings": 450 }
    },
    "by_recommendation": {
      "terminate": 5,
      "downsize": 15,
      "auto-scale": 8,
      "optimize": 17
    }
  }
}
```

### GET /api/functions/query-table (resource_utilization_ml)

**Request:**
```json
{
  "table": "resource_utilization_ml",
  "select": "*",
  "eq": {
    "organization_id": "uuid",
    "aws_account_id": "uuid"
  },
  "order": { "potential_monthly_savings": "desc" },
  "limit": 100
}
```

## Performance Considerations

1. **Timeout Management**
   - Max execution time: 25 seconds (under API Gateway 29s limit)
   - Process one region at a time
   - Limit instances per region to 50
   - Use parallel CloudWatch metric fetches

2. **CloudWatch API Optimization**
   - Use 1-hour period for 7-day analysis (168 datapoints vs 2016)
   - Batch metric requests where possible
   - Cache pricing data in memory

3. **Database Optimization**
   - Use upsert to avoid duplicates
   - Batch inserts for recommendations
   - Index on organization_id, aws_account_id

## Security Considerations

1. **Multi-tenancy**
   - All queries filtered by organization_id
   - AWS credentials isolated per organization
   - No cross-tenant data access

2. **AWS Credentials**
   - Use STS AssumeRole for customer accounts
   - Short-lived session tokens (1 hour)
   - Minimal required permissions

3. **Data Protection**
   - No sensitive data in recommendations
   - Resource IDs only (no secrets)
   - Audit logging for all operations
