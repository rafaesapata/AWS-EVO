/**
 * Dynamic Pricing Service
 * 
 * Provides pricing data with caching and regional variations.
 * Uses static pricing data with fallback support.
 */

import { logger } from '../logging.js';
import { MetricsCache } from '../caching/metrics-cache.js';
import {
  EC2_PRICING,
  RDS_PRICING,
  LAMBDA_PRICING,
  S3_PRICING,
  DYNAMODB_PRICING,
  EBS_PRICING,
  NAT_GATEWAY_PRICING,
  EIP_PRICING,
} from '../cost/pricing.js';

// Price cache with 24-hour TTL
const priceCache = new MetricsCache<number>({
  defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
  maxSize: 1000,
});

interface PriceResult {
  price: number;
  source: 'cache' | 'static' | 'fallback';
  currency: string;
}

/**
 * Get EC2 instance price
 */
export function getEC2Price(
  instanceType: string,
  region: string = 'us-east-1'
): PriceResult {
  const cacheKey = MetricsCache.generateKey('ec2', instanceType, region);
  
  // Check cache first
  const cached = priceCache.get(cacheKey);
  if (cached !== undefined) {
    return { price: cached, source: 'cache', currency: 'USD' };
  }
  
  // Apply regional pricing multiplier
  const basePrice = EC2_PRICING[instanceType] || EC2_PRICING[instanceType.toLowerCase()] || 0.05;
  const regionalMultiplier = getRegionalMultiplier(region);
  const price = basePrice * regionalMultiplier;
  
  priceCache.set(cacheKey, price);
  return { price, source: 'static', currency: 'USD' };
}

/**
 * Get RDS instance price
 */
export function getRDSPrice(
  instanceClass: string,
  engine: string = 'postgres',
  region: string = 'us-east-1'
): PriceResult {
  const cacheKey = MetricsCache.generateKey('rds', instanceClass, engine, region);
  
  const cached = priceCache.get(cacheKey);
  if (cached !== undefined) {
    return { price: cached, source: 'cache', currency: 'USD' };
  }
  
  const basePrice = RDS_PRICING[instanceClass] || RDS_PRICING[instanceClass.toLowerCase()] || 0.05;
  const regionalMultiplier = getRegionalMultiplier(region);
  const price = basePrice * regionalMultiplier;
  
  priceCache.set(cacheKey, price);
  return { price, source: 'static', currency: 'USD' };
}

/**
 * Get Lambda price (per GB-second)
 */
export function getLambdaPrice(region: string = 'us-east-1'): PriceResult {
  // Lambda pricing is relatively stable, use static pricing
  return {
    price: LAMBDA_PRICING.durationCostPerGBSecond,
    source: 'fallback',
    currency: 'USD',
  };
}

/**
 * Get S3 storage price per GB
 */
export function getS3Price(storageClass: string = 'STANDARD', region: string = 'us-east-1'): PriceResult {
  const prices: Record<string, number> = {
    'STANDARD': S3_PRICING.standard,
    'INTELLIGENT_TIERING': S3_PRICING.intelligentTiering,
    'STANDARD_IA': S3_PRICING.standardIA,
    'ONEZONE_IA': S3_PRICING.oneZoneIA,
    'GLACIER': S3_PRICING.glacier,
    'DEEP_ARCHIVE': S3_PRICING.glacierDeepArchive,
  };
  
  return {
    price: prices[storageClass] || S3_PRICING.standard,
    source: 'fallback',
    currency: 'USD',
  };
}

/**
 * Get DynamoDB price
 */
export function getDynamoDBPrice(billingMode: 'PROVISIONED' | 'PAY_PER_REQUEST'): {
  readPrice: number;
  writePrice: number;
  storagePrice: number;
  source: 'fallback';
} {
  if (billingMode === 'PROVISIONED') {
    return {
      readPrice: DYNAMODB_PRICING.provisionedReadPerHour,
      writePrice: DYNAMODB_PRICING.provisionedWritePerHour,
      storagePrice: DYNAMODB_PRICING.storagePerGBMonth,
      source: 'fallback',
    };
  }
  
  return {
    readPrice: DYNAMODB_PRICING.onDemandReadPerMillion / 1000000,
    writePrice: DYNAMODB_PRICING.onDemandWritePerMillion / 1000000,
    storagePrice: DYNAMODB_PRICING.storagePerGBMonth,
    source: 'fallback',
  };
}

/**
 * Get EBS volume price per GB-month
 */
export function getEBSPrice(volumeType: string): PriceResult {
  const price = EBS_PRICING[volumeType] || EBS_PRICING['gp3'];
  return { price, source: 'fallback', currency: 'USD' };
}

/**
 * Get NAT Gateway price
 */
export function getNATGatewayPrice(): { hourlyRate: number; dataProcessingPerGB: number; source: 'fallback' } {
  return {
    hourlyRate: NAT_GATEWAY_PRICING.hourlyRate,
    dataProcessingPerGB: NAT_GATEWAY_PRICING.dataProcessingPerGB,
    source: 'fallback',
  };
}

/**
 * Get Elastic IP price
 */
export function getEIPPrice(): { hourlyRate: number; monthlyRate: number; source: 'fallback' } {
  return {
    hourlyRate: EIP_PRICING.unassociatedHourly,
    monthlyRate: EIP_PRICING.monthlyUnassociated,
    source: 'fallback',
  };
}

/**
 * Get cache statistics
 */
export function getPriceCacheStats(): { hits: number; misses: number; size: number; hitRate: number } {
  return priceCache.getStats();
}

/**
 * Clear price cache
 */
export function clearPriceCache() {
  priceCache.clear();
}

// Helper functions

function getRegionalMultiplier(region: string): number {
  const multipliers: Record<string, number> = {
    'us-east-1': 1.0,
    'us-east-2': 1.0,
    'us-west-1': 1.05,
    'us-west-2': 1.0,
    'eu-west-1': 1.1,
    'eu-west-2': 1.12,
    'eu-central-1': 1.1,
    'ap-northeast-1': 1.15,
    'ap-southeast-1': 1.1,
    'ap-southeast-2': 1.12,
    'sa-east-1': 1.25,
  };
  return multipliers[region] || 1.0;
}
