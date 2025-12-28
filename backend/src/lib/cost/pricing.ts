/**
 * AWS Resource Pricing Module
 * 
 * Contains pricing data and cost calculation functions for AWS resources.
 * Prices are in USD and based on us-east-1 on-demand pricing.
 */

// EC2 On-Demand pricing (us-east-1, USD/hour)
export const EC2_PRICING: Record<string, number> = {
  // T3 family (burstable)
  't3.nano': 0.0052,
  't3.micro': 0.0104,
  't3.small': 0.0208,
  't3.medium': 0.0416,
  't3.large': 0.0832,
  't3.xlarge': 0.1664,
  't3.2xlarge': 0.3328,
  
  // T2 family (burstable, previous gen)
  't2.nano': 0.0058,
  't2.micro': 0.0116,
  't2.small': 0.023,
  't2.medium': 0.0464,
  't2.large': 0.0928,
  't2.xlarge': 0.1856,
  't2.2xlarge': 0.3712,
  
  // M5 family (general purpose)
  'm5.large': 0.096,
  'm5.xlarge': 0.192,
  'm5.2xlarge': 0.384,
  'm5.4xlarge': 0.768,
  'm5.8xlarge': 1.536,
  'm5.12xlarge': 2.304,
  'm5.16xlarge': 3.072,
  'm5.24xlarge': 4.608,
  
  // M6i family (general purpose, latest)
  'm6i.large': 0.096,
  'm6i.xlarge': 0.192,
  'm6i.2xlarge': 0.384,
  'm6i.4xlarge': 0.768,
  
  // C5 family (compute optimized)
  'c5.large': 0.085,
  'c5.xlarge': 0.17,
  'c5.2xlarge': 0.34,
  'c5.4xlarge': 0.68,
  'c5.9xlarge': 1.53,
  'c5.12xlarge': 2.04,
  'c5.18xlarge': 3.06,
  'c5.24xlarge': 4.08,
  
  // C6i family (compute optimized, latest)
  'c6i.large': 0.085,
  'c6i.xlarge': 0.17,
  'c6i.2xlarge': 0.34,
  'c6i.4xlarge': 0.68,
  
  // R5 family (memory optimized)
  'r5.large': 0.126,
  'r5.xlarge': 0.252,
  'r5.2xlarge': 0.504,
  'r5.4xlarge': 1.008,
  'r5.8xlarge': 2.016,
  'r5.12xlarge': 3.024,
  'r5.16xlarge': 4.032,
  'r5.24xlarge': 6.048,
  
  // R6i family (memory optimized, latest)
  'r6i.large': 0.126,
  'r6i.xlarge': 0.252,
  'r6i.2xlarge': 0.504,
  'r6i.4xlarge': 1.008,
};

// RDS pricing (us-east-1, USD/hour, single-AZ)
export const RDS_PRICING: Record<string, number> = {
  // T3 family
  'db.t3.micro': 0.017,
  'db.t3.small': 0.034,
  'db.t3.medium': 0.068,
  'db.t3.large': 0.136,
  'db.t3.xlarge': 0.272,
  'db.t3.2xlarge': 0.544,
  
  // T2 family (previous gen)
  'db.t2.micro': 0.017,
  'db.t2.small': 0.034,
  'db.t2.medium': 0.068,
  'db.t2.large': 0.136,
  
  // M5 family
  'db.m5.large': 0.171,
  'db.m5.xlarge': 0.342,
  'db.m5.2xlarge': 0.684,
  'db.m5.4xlarge': 1.368,
  'db.m5.8xlarge': 2.736,
  'db.m5.12xlarge': 4.104,
  'db.m5.16xlarge': 5.472,
  'db.m5.24xlarge': 8.208,
  
  // R5 family
  'db.r5.large': 0.24,
  'db.r5.xlarge': 0.48,
  'db.r5.2xlarge': 0.96,
  'db.r5.4xlarge': 1.92,
  'db.r5.8xlarge': 3.84,
  'db.r5.12xlarge': 5.76,
  'db.r5.16xlarge': 7.68,
  'db.r5.24xlarge': 11.52,
};

// Lambda pricing
export const LAMBDA_PRICING = {
  requestCost: 0.0000002, // $0.20 per 1M requests
  durationCostPerGBSecond: 0.0000166667, // $0.0000166667 per GB-second
};

// ElastiCache pricing (us-east-1, USD/hour)
export const ELASTICACHE_PRICING: Record<string, number> = {
  'cache.t3.micro': 0.017,
  'cache.t3.small': 0.034,
  'cache.t3.medium': 0.068,
  'cache.m5.large': 0.155,
  'cache.m5.xlarge': 0.31,
  'cache.m5.2xlarge': 0.62,
  'cache.r5.large': 0.228,
  'cache.r5.xlarge': 0.456,
  'cache.r5.2xlarge': 0.912,
};

// NAT Gateway pricing
export const NAT_GATEWAY_PRICING = {
  hourlyRate: 0.045, // $0.045 per hour
  dataProcessingPerGB: 0.045, // $0.045 per GB processed
};

// EBS pricing (USD/GB-month)
export const EBS_PRICING: Record<string, number> = {
  'gp2': 0.10,
  'gp3': 0.08,
  'io1': 0.125,
  'io2': 0.125,
  'st1': 0.045,
  'sc1': 0.015,
  'standard': 0.05,
};

// Elastic IP pricing
export const EIP_PRICING = {
  unassociatedHourly: 0.005, // $0.005 per hour when not associated
  monthlyUnassociated: 3.60, // ~$3.60 per month
};

// S3 pricing (USD/GB-month, us-east-1)
export const S3_PRICING = {
  standard: 0.023, // First 50 TB
  intelligentTiering: 0.0125, // Frequent access tier
  standardIA: 0.0125, // Infrequent Access
  oneZoneIA: 0.01,
  glacier: 0.004,
  glacierDeepArchive: 0.00099,
  // Request pricing
  putRequestPer1000: 0.005,
  getRequestPer1000: 0.0004,
};

// DynamoDB pricing (USD, us-east-1)
export const DYNAMODB_PRICING = {
  // On-Demand
  onDemandWritePerMillion: 1.25, // $1.25 per million WCU
  onDemandReadPerMillion: 0.25, // $0.25 per million RCU
  // Provisioned
  provisionedWritePerHour: 0.00065, // per WCU per hour
  provisionedReadPerHour: 0.00013, // per RCU per hour
  // Storage
  storagePerGBMonth: 0.25,
};

// Hours per month (average)
const HOURS_PER_MONTH = 730;

/**
 * Get hourly cost for a resource
 */
export function getHourlyCost(resourceType: string, size: string): number {
  const normalizedType = resourceType.toLowerCase();
  
  if (normalizedType.includes('ec2') || normalizedType === 'instance') {
    return EC2_PRICING[size] || EC2_PRICING[size.toLowerCase()] || 0.05;
  }
  
  if (normalizedType.includes('rds') || normalizedType.includes('database')) {
    return RDS_PRICING[size] || RDS_PRICING[size.toLowerCase()] || 0.05;
  }
  
  if (normalizedType.includes('elasticache') || normalizedType.includes('cache')) {
    return ELASTICACHE_PRICING[size] || ELASTICACHE_PRICING[size.toLowerCase()] || 0.05;
  }
  
  if (normalizedType.includes('nat')) {
    return NAT_GATEWAY_PRICING.hourlyRate;
  }
  
  return 0.05; // Default estimate
}

/**
 * Get monthly cost for a resource
 */
export function getMonthlyCost(resourceType: string, size: string): number {
  return getHourlyCost(resourceType, size) * HOURS_PER_MONTH;
}

/**
 * Get Lambda monthly cost estimate based on invocations and duration
 */
export function getLambdaMonthlyCost(
  invocationsPerMonth: number,
  avgDurationMs: number,
  memorySizeMB: number
): number {
  const requestCost = invocationsPerMonth * LAMBDA_PRICING.requestCost;
  const gbSeconds = (invocationsPerMonth * avgDurationMs / 1000) * (memorySizeMB / 1024);
  const durationCost = gbSeconds * LAMBDA_PRICING.durationCostPerGBSecond;
  return requestCost + durationCost;
}

/**
 * Get EBS volume monthly cost
 */
export function getEBSMonthlyCost(volumeType: string, sizeGB: number): number {
  const pricePerGB = EBS_PRICING[volumeType] || EBS_PRICING['gp3'];
  return sizeGB * pricePerGB;
}

// Downsize mapping for EC2
const EC2_DOWNSIZE_MAP: Record<string, string> = {
  // T3 family
  't3.2xlarge': 't3.xlarge',
  't3.xlarge': 't3.large',
  't3.large': 't3.medium',
  't3.medium': 't3.small',
  't3.small': 't3.micro',
  't3.micro': 't3.nano',
  
  // T2 family
  't2.2xlarge': 't2.xlarge',
  't2.xlarge': 't2.large',
  't2.large': 't2.medium',
  't2.medium': 't2.small',
  't2.small': 't2.micro',
  't2.micro': 't2.nano',
  
  // M5 family
  'm5.24xlarge': 'm5.16xlarge',
  'm5.16xlarge': 'm5.12xlarge',
  'm5.12xlarge': 'm5.8xlarge',
  'm5.8xlarge': 'm5.4xlarge',
  'm5.4xlarge': 'm5.2xlarge',
  'm5.2xlarge': 'm5.xlarge',
  'm5.xlarge': 'm5.large',
  
  // C5 family
  'c5.24xlarge': 'c5.18xlarge',
  'c5.18xlarge': 'c5.12xlarge',
  'c5.12xlarge': 'c5.9xlarge',
  'c5.9xlarge': 'c5.4xlarge',
  'c5.4xlarge': 'c5.2xlarge',
  'c5.2xlarge': 'c5.xlarge',
  'c5.xlarge': 'c5.large',
  
  // R5 family
  'r5.24xlarge': 'r5.16xlarge',
  'r5.16xlarge': 'r5.12xlarge',
  'r5.12xlarge': 'r5.8xlarge',
  'r5.8xlarge': 'r5.4xlarge',
  'r5.4xlarge': 'r5.2xlarge',
  'r5.2xlarge': 'r5.xlarge',
  'r5.xlarge': 'r5.large',
};

// Downsize mapping for RDS
const RDS_DOWNSIZE_MAP: Record<string, string> = {
  'db.m5.24xlarge': 'db.m5.16xlarge',
  'db.m5.16xlarge': 'db.m5.12xlarge',
  'db.m5.12xlarge': 'db.m5.8xlarge',
  'db.m5.8xlarge': 'db.m5.4xlarge',
  'db.m5.4xlarge': 'db.m5.2xlarge',
  'db.m5.2xlarge': 'db.m5.xlarge',
  'db.m5.xlarge': 'db.m5.large',
  
  'db.r5.24xlarge': 'db.r5.16xlarge',
  'db.r5.16xlarge': 'db.r5.12xlarge',
  'db.r5.12xlarge': 'db.r5.8xlarge',
  'db.r5.8xlarge': 'db.r5.4xlarge',
  'db.r5.4xlarge': 'db.r5.2xlarge',
  'db.r5.2xlarge': 'db.r5.xlarge',
  'db.r5.xlarge': 'db.r5.large',
  
  'db.t3.2xlarge': 'db.t3.xlarge',
  'db.t3.xlarge': 'db.t3.large',
  'db.t3.large': 'db.t3.medium',
  'db.t3.medium': 'db.t3.small',
  'db.t3.small': 'db.t3.micro',
};

/**
 * Get downsize recommendation for a resource
 */
export function getDownsizeRecommendation(
  resourceType: string,
  currentSize: string,
  maxUtilization: number
): string {
  const normalizedType = resourceType.toLowerCase();
  let downsizeMap: Record<string, string>;
  
  if (normalizedType.includes('rds') || normalizedType.includes('database')) {
    downsizeMap = RDS_DOWNSIZE_MAP;
  } else {
    downsizeMap = EC2_DOWNSIZE_MAP;
  }
  
  // If utilization is very low, recommend 2 sizes down
  if (maxUtilization < 20) {
    const oneDown = downsizeMap[currentSize];
    if (oneDown && downsizeMap[oneDown]) {
      return downsizeMap[oneDown];
    }
  }
  
  return downsizeMap[currentSize] || currentSize;
}

/**
 * Calculate potential savings from downsizing
 */
export function calculateDownsizeSavings(
  resourceType: string,
  currentSize: string,
  recommendedSize: string
): number {
  const currentCost = getMonthlyCost(resourceType, currentSize);
  const newCost = getMonthlyCost(resourceType, recommendedSize);
  return Math.max(0, currentCost - newCost);
}

/**
 * Get S3 bucket monthly cost estimate
 */
export function getS3MonthlyCost(sizeGB: number, storageClass: string = 'STANDARD'): number {
  const classMap: Record<string, number> = {
    'STANDARD': S3_PRICING.standard,
    'INTELLIGENT_TIERING': S3_PRICING.intelligentTiering,
    'STANDARD_IA': S3_PRICING.standardIA,
    'ONEZONE_IA': S3_PRICING.oneZoneIA,
    'GLACIER': S3_PRICING.glacier,
    'DEEP_ARCHIVE': S3_PRICING.glacierDeepArchive,
  };
  const pricePerGB = classMap[storageClass] || S3_PRICING.standard;
  return sizeGB * pricePerGB;
}

/**
 * Get DynamoDB table monthly cost estimate (provisioned mode)
 */
export function getDynamoDBProvisionedMonthlyCost(readCapacity: number, writeCapacity: number, storageSizeGB: number): number {
  const readCost = readCapacity * DYNAMODB_PRICING.provisionedReadPerHour * HOURS_PER_MONTH;
  const writeCost = writeCapacity * DYNAMODB_PRICING.provisionedWritePerHour * HOURS_PER_MONTH;
  const storageCost = storageSizeGB * DYNAMODB_PRICING.storagePerGBMonth;
  return readCost + writeCost + storageCost;
}

/**
 * Get DynamoDB table monthly cost estimate (on-demand mode)
 */
export function getDynamoDBOnDemandMonthlyCost(readUnits: number, writeUnits: number, storageSizeGB: number): number {
  const readCost = (readUnits / 1000000) * DYNAMODB_PRICING.onDemandReadPerMillion;
  const writeCost = (writeUnits / 1000000) * DYNAMODB_PRICING.onDemandWritePerMillion;
  const storageCost = storageSizeGB * DYNAMODB_PRICING.storagePerGBMonth;
  return readCost + writeCost + storageCost;
}
