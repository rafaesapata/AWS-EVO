"use strict";
/**
 * Dynamic Pricing Service
 *
 * Provides pricing data with caching and regional variations.
 * Uses static pricing data with fallback support.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEC2Price = getEC2Price;
exports.getRDSPrice = getRDSPrice;
exports.getLambdaPrice = getLambdaPrice;
exports.getS3Price = getS3Price;
exports.getDynamoDBPrice = getDynamoDBPrice;
exports.getEBSPrice = getEBSPrice;
exports.getNATGatewayPrice = getNATGatewayPrice;
exports.getEIPPrice = getEIPPrice;
exports.getPriceCacheStats = getPriceCacheStats;
exports.clearPriceCache = clearPriceCache;
const metrics_cache_js_1 = require("../caching/metrics-cache.js");
const pricing_js_1 = require("../cost/pricing.js");
// Price cache with 24-hour TTL
const priceCache = new metrics_cache_js_1.MetricsCache({
    defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
    maxSize: 1000,
});
/**
 * Get EC2 instance price
 */
function getEC2Price(instanceType, region = 'us-east-1') {
    const cacheKey = metrics_cache_js_1.MetricsCache.generateKey('ec2', instanceType, region);
    // Check cache first
    const cached = priceCache.get(cacheKey);
    if (cached !== undefined) {
        return { price: cached, source: 'cache', currency: 'USD' };
    }
    // Apply regional pricing multiplier
    const basePrice = pricing_js_1.EC2_PRICING[instanceType] || pricing_js_1.EC2_PRICING[instanceType.toLowerCase()] || 0.05;
    const regionalMultiplier = getRegionalMultiplier(region);
    const price = basePrice * regionalMultiplier;
    priceCache.set(cacheKey, price);
    return { price, source: 'static', currency: 'USD' };
}
/**
 * Get RDS instance price
 */
function getRDSPrice(instanceClass, engine = 'postgres', region = 'us-east-1') {
    const cacheKey = metrics_cache_js_1.MetricsCache.generateKey('rds', instanceClass, engine, region);
    const cached = priceCache.get(cacheKey);
    if (cached !== undefined) {
        return { price: cached, source: 'cache', currency: 'USD' };
    }
    const basePrice = pricing_js_1.RDS_PRICING[instanceClass] || pricing_js_1.RDS_PRICING[instanceClass.toLowerCase()] || 0.05;
    const regionalMultiplier = getRegionalMultiplier(region);
    const price = basePrice * regionalMultiplier;
    priceCache.set(cacheKey, price);
    return { price, source: 'static', currency: 'USD' };
}
/**
 * Get Lambda price (per GB-second)
 */
function getLambdaPrice(region = 'us-east-1') {
    // Lambda pricing is relatively stable, use static pricing
    return {
        price: pricing_js_1.LAMBDA_PRICING.durationCostPerGBSecond,
        source: 'fallback',
        currency: 'USD',
    };
}
/**
 * Get S3 storage price per GB
 */
function getS3Price(storageClass = 'STANDARD', region = 'us-east-1') {
    const prices = {
        'STANDARD': pricing_js_1.S3_PRICING.standard,
        'INTELLIGENT_TIERING': pricing_js_1.S3_PRICING.intelligentTiering,
        'STANDARD_IA': pricing_js_1.S3_PRICING.standardIA,
        'ONEZONE_IA': pricing_js_1.S3_PRICING.oneZoneIA,
        'GLACIER': pricing_js_1.S3_PRICING.glacier,
        'DEEP_ARCHIVE': pricing_js_1.S3_PRICING.glacierDeepArchive,
    };
    return {
        price: prices[storageClass] || pricing_js_1.S3_PRICING.standard,
        source: 'fallback',
        currency: 'USD',
    };
}
/**
 * Get DynamoDB price
 */
function getDynamoDBPrice(billingMode) {
    if (billingMode === 'PROVISIONED') {
        return {
            readPrice: pricing_js_1.DYNAMODB_PRICING.provisionedReadPerHour,
            writePrice: pricing_js_1.DYNAMODB_PRICING.provisionedWritePerHour,
            storagePrice: pricing_js_1.DYNAMODB_PRICING.storagePerGBMonth,
            source: 'fallback',
        };
    }
    return {
        readPrice: pricing_js_1.DYNAMODB_PRICING.onDemandReadPerMillion / 1000000,
        writePrice: pricing_js_1.DYNAMODB_PRICING.onDemandWritePerMillion / 1000000,
        storagePrice: pricing_js_1.DYNAMODB_PRICING.storagePerGBMonth,
        source: 'fallback',
    };
}
/**
 * Get EBS volume price per GB-month
 */
function getEBSPrice(volumeType) {
    const price = pricing_js_1.EBS_PRICING[volumeType] || pricing_js_1.EBS_PRICING['gp3'];
    return { price, source: 'fallback', currency: 'USD' };
}
/**
 * Get NAT Gateway price
 */
function getNATGatewayPrice() {
    return {
        hourlyRate: pricing_js_1.NAT_GATEWAY_PRICING.hourlyRate,
        dataProcessingPerGB: pricing_js_1.NAT_GATEWAY_PRICING.dataProcessingPerGB,
        source: 'fallback',
    };
}
/**
 * Get Elastic IP price
 */
function getEIPPrice() {
    return {
        hourlyRate: pricing_js_1.EIP_PRICING.unassociatedHourly,
        monthlyRate: pricing_js_1.EIP_PRICING.monthlyUnassociated,
        source: 'fallback',
    };
}
/**
 * Get cache statistics
 */
function getPriceCacheStats() {
    return priceCache.getStats();
}
/**
 * Clear price cache
 */
function clearPriceCache() {
    priceCache.clear();
}
// Helper functions
function getRegionalMultiplier(region) {
    const multipliers = {
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
//# sourceMappingURL=dynamic-pricing-service.js.map