/**
 * Dynamic Pricing Service
 *
 * Provides pricing data with caching and regional variations.
 * Uses static pricing data with fallback support.
 */
interface PriceResult {
    price: number;
    source: 'cache' | 'static' | 'fallback';
    currency: string;
}
/**
 * Get EC2 instance price
 */
export declare function getEC2Price(instanceType: string, region?: string): PriceResult;
/**
 * Get RDS instance price
 */
export declare function getRDSPrice(instanceClass: string, engine?: string, region?: string): PriceResult;
/**
 * Get Lambda price (per GB-second)
 */
export declare function getLambdaPrice(region?: string): PriceResult;
/**
 * Get S3 storage price per GB
 */
export declare function getS3Price(storageClass?: string, region?: string): PriceResult;
/**
 * Get DynamoDB price
 */
export declare function getDynamoDBPrice(billingMode: 'PROVISIONED' | 'PAY_PER_REQUEST'): {
    readPrice: number;
    writePrice: number;
    storagePrice: number;
    source: 'fallback';
};
/**
 * Get EBS volume price per GB-month
 */
export declare function getEBSPrice(volumeType: string): PriceResult;
/**
 * Get NAT Gateway price
 */
export declare function getNATGatewayPrice(): {
    hourlyRate: number;
    dataProcessingPerGB: number;
    source: 'fallback';
};
/**
 * Get Elastic IP price
 */
export declare function getEIPPrice(): {
    hourlyRate: number;
    monthlyRate: number;
    source: 'fallback';
};
/**
 * Get cache statistics
 */
export declare function getPriceCacheStats(): {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
};
/**
 * Clear price cache
 */
export declare function clearPriceCache(): void;
export {};
//# sourceMappingURL=dynamic-pricing-service.d.ts.map