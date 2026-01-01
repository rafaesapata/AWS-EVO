/**
 * Analyzer Types and Interfaces
 *
 * Defines all types used by resource analyzers for ML waste detection.
 *
 * @module analyzers/types
 */
/**
 * AWS credentials for analyzer operations
 */
export interface AwsCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
}
/**
 * Options for analysis operations
 */
export interface AnalysisOptions {
    /** Maximum number of resources to analyze */
    maxResources?: number;
    /** Remaining time in milliseconds before timeout */
    remainingTime?: number;
    /** Analysis depth - standard or deep */
    analysisDepth?: 'standard' | 'deep';
    /** Whether to include CloudWatch metrics */
    includeMetrics?: boolean;
}
/**
 * Resource dependency information
 */
export interface ResourceDependency {
    /** ARN of the dependent resource */
    resourceArn: string;
    /** Type of the dependent resource */
    resourceType: string;
    /** Type of dependency relationship */
    dependencyType: 'uses' | 'used-by' | 'attached-to';
}
/**
 * Auto-scaling configuration recommendation
 */
export interface AutoScalingConfig {
    /** Minimum capacity */
    min_capacity: number;
    /** Maximum capacity */
    max_capacity: number;
    /** Target CPU utilization percentage */
    target_cpu: number;
    /** Scale-in cooldown in seconds */
    scale_in_cooldown: number;
    /** Scale-out cooldown in seconds */
    scale_out_cooldown: number;
}
/**
 * Implementation step for remediation
 */
export interface ImplementationStep {
    /** Step order (1-based) */
    order: number;
    /** Description of the action */
    action: string;
    /** AWS CLI command (optional) */
    command?: string;
    /** Risk level of this step */
    riskLevel: 'safe' | 'review' | 'destructive';
    /** Rollback command if available */
    rollbackCommand?: string;
    /** Additional notes */
    notes?: string;
}
/**
 * Utilization patterns detected by ML analysis
 */
export interface UtilizationPatterns {
    /** Average CPU usage percentage */
    avgCpuUsage: number;
    /** Maximum CPU usage percentage */
    maxCpuUsage: number;
    /** Average memory usage percentage */
    avgMemoryUsage: number;
    /** Maximum memory usage percentage */
    maxMemoryUsage: number;
    /** Hours of peak usage (0-23) */
    peakHours: number[];
    /** Usage pattern by day of week (Mon-Sun) */
    weekdayPattern: number[];
    /** Whether real CloudWatch metrics were used */
    hasRealMetrics: boolean;
    /** Data completeness (0-1) */
    dataCompleteness: number;
    /** Usage trend */
    trend: 'increasing' | 'stable' | 'decreasing';
    /** Detected seasonality pattern */
    seasonality: 'daily' | 'weekly' | 'monthly' | 'none';
}
/**
 * ML analysis result for a single resource
 */
export interface MLResult {
    /** Resource identifier (e.g., instance ID, bucket name) */
    resourceId: string;
    /** Full ARN of the resource */
    resourceArn: string;
    /** Human-readable resource name */
    resourceName: string | null;
    /** Resource type (e.g., 'EC2::Instance', 'S3::Bucket') */
    resourceType: string;
    /** Resource subtype (e.g., 'gp3' for EBS, 't3.micro' for EC2) */
    resourceSubtype?: string;
    /** AWS region */
    region: string;
    /** 12-digit AWS account ID */
    accountId: string;
    /** Current size/configuration */
    currentSize: string;
    /** Current monthly cost in USD */
    currentMonthlyCost: number;
    /** Current hourly cost in USD */
    currentHourlyCost: number;
    /** Type of recommendation */
    recommendationType: 'terminate' | 'downsize' | 'auto-scale' | 'optimize' | 'migrate';
    /** Priority score (1-5, 5 being highest) */
    recommendationPriority: number;
    /** Recommended size/configuration */
    recommendedSize: string | null;
    /** Potential monthly savings in USD */
    potentialMonthlySavings: number;
    /** Potential annual savings in USD */
    potentialAnnualSavings: number;
    /** ML confidence score (0-1) */
    mlConfidence: number;
    /** Utilization patterns from CloudWatch metrics */
    utilizationPatterns: UtilizationPatterns;
    /** Additional resource metadata */
    resourceMetadata: Record<string, any>;
    /** Resource dependencies */
    dependencies: ResourceDependency[];
    /** Whether resource is eligible for auto-scaling */
    autoScalingEligible: boolean;
    /** Recommended auto-scaling configuration */
    autoScalingConfig: AutoScalingConfig | null;
    /** Complexity of implementing the recommendation */
    implementationComplexity: 'low' | 'medium' | 'high';
    /** Step-by-step implementation instructions */
    implementationSteps: ImplementationStep[];
    /** Risk assessment for the recommendation */
    riskAssessment: 'low' | 'medium' | 'high';
    /** Last activity timestamp */
    lastActivityAt: Date | null;
    /** Days since last activity */
    daysSinceActivity: number | null;
    /** When the analysis was performed */
    analyzedAt: Date;
}
/**
 * Interface for resource analyzers
 */
export interface ResourceAnalyzer {
    /** Human-readable service name */
    readonly serviceName: string;
    /** Service code for ARN building */
    readonly serviceCode: string;
    /** Priority for execution order (lower = higher priority) */
    readonly priority: number;
    /**
     * Analyze resources and return ML results
     */
    analyze(credentials: AwsCredentials, region: string, accountId: string, options: AnalysisOptions): Promise<MLResult[]>;
    /**
     * Get estimated duration in milliseconds
     */
    getEstimatedDuration(): number;
    /**
     * Get list of supported resource types
     */
    getSupportedResourceTypes(): string[];
}
/**
 * Simplified MLResult for backward compatibility with existing handler
 */
export interface MLResultLegacy {
    resourceId: string;
    resourceName: string | null;
    resourceType: string;
    region: string;
    currentSize: string;
    currentMonthlyCost: number;
    recommendationType: 'terminate' | 'downsize' | 'auto-scale' | 'optimize';
    recommendedSize: string | null;
    potentialMonthlySavings: number;
    mlConfidence: number;
    utilizationPatterns: any;
    autoScalingEligible: boolean;
    autoScalingConfig: any | null;
    implementationComplexity: 'low' | 'medium' | 'high';
}
/**
 * Convert full MLResult to legacy format
 */
export declare function toLegacyResult(result: MLResult): MLResultLegacy;
/**
 * Calculate recommendation priority based on savings
 */
export declare function calculatePriority(monthlySavings: number, confidence: number): number;
//# sourceMappingURL=types.d.ts.map