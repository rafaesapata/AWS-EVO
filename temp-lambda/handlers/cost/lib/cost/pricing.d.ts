/**
 * AWS Resource Pricing Module
 *
 * Contains pricing data and cost calculation functions for AWS resources.
 * Prices are in USD and based on us-east-1 on-demand pricing.
 */
export declare const EC2_PRICING: Record<string, number>;
export declare const RDS_PRICING: Record<string, number>;
export declare const LAMBDA_PRICING: {
    requestCost: number;
    durationCostPerGBSecond: number;
};
export declare const ELASTICACHE_PRICING: Record<string, number>;
export declare const NAT_GATEWAY_PRICING: {
    hourlyRate: number;
    dataProcessingPerGB: number;
};
export declare const EBS_PRICING: Record<string, number>;
export declare const EIP_PRICING: {
    unassociatedHourly: number;
    monthlyUnassociated: number;
};
export declare const S3_PRICING: {
    standard: number;
    intelligentTiering: number;
    standardIA: number;
    oneZoneIA: number;
    glacier: number;
    glacierDeepArchive: number;
    putRequestPer1000: number;
    getRequestPer1000: number;
};
export declare const DYNAMODB_PRICING: {
    onDemandWritePerMillion: number;
    onDemandReadPerMillion: number;
    provisionedWritePerHour: number;
    provisionedReadPerHour: number;
    storagePerGBMonth: number;
};
/**
 * Get hourly cost for a resource
 */
export declare function getHourlyCost(resourceType: string, size: string): number;
/**
 * Get monthly cost for a resource
 */
export declare function getMonthlyCost(resourceType: string, size: string): number;
/**
 * Get Lambda monthly cost estimate based on invocations and duration
 */
export declare function getLambdaMonthlyCost(invocationsPerMonth: number, avgDurationMs: number, memorySizeMB: number): number;
/**
 * Get EBS volume monthly cost
 */
export declare function getEBSMonthlyCost(volumeType: string, sizeGB: number): number;
/**
 * Get downsize recommendation for a resource
 */
export declare function getDownsizeRecommendation(resourceType: string, currentSize: string, maxUtilization: number): string;
/**
 * Calculate potential savings from downsizing
 */
export declare function calculateDownsizeSavings(resourceType: string, currentSize: string, recommendedSize: string): number;
/**
 * Get S3 bucket monthly cost estimate
 */
export declare function getS3MonthlyCost(sizeGB: number, storageClass?: string): number;
/**
 * Get DynamoDB table monthly cost estimate (provisioned mode)
 */
export declare function getDynamoDBProvisionedMonthlyCost(readCapacity: number, writeCapacity: number, storageSizeGB: number): number;
/**
 * Get DynamoDB table monthly cost estimate (on-demand mode)
 */
export declare function getDynamoDBOnDemandMonthlyCost(readUnits: number, writeUnits: number, storageSizeGB: number): number;
//# sourceMappingURL=pricing.d.ts.map