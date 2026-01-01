/**
 * ML Waste Analyzer Module
 *
 * Provides statistical analysis and ML-based classification for AWS resource waste detection.
 * Uses pattern recognition to identify idle, underutilized, and oversized resources.
 */
export interface CloudWatchDatapoint {
    Timestamp?: Date;
    Average?: number;
    Maximum?: number;
    Minimum?: number;
    Sum?: number;
    SampleCount?: number;
}
export interface UtilizationMetrics {
    avgCpu: number;
    maxCpu: number;
    minCpu: number;
    stdDevCpu: number;
    avgMemory: number;
    maxMemory: number;
    peakHours: number[];
    weekdayPattern: number[];
    dataCompleteness: number;
    datapointCount: number;
}
export interface AutoScalingConfig {
    min_capacity: number;
    max_capacity: number;
    target_cpu: number;
    scale_in_cooldown: number;
    scale_out_cooldown: number;
}
export interface MLRecommendation {
    type: 'terminate' | 'downsize' | 'auto-scale' | 'optimize';
    confidence: number;
    recommendedSize?: string;
    savings: number;
    autoScalingConfig?: AutoScalingConfig;
    complexity: 'low' | 'medium' | 'high';
}
export interface UtilizationPatterns {
    avgCpuUsage: number;
    avgMemoryUsage: number;
    peakHours: number[];
    weekdayPattern?: number[];
    hasRealMetrics: boolean;
}
/**
 * Analyze CloudWatch metrics and extract utilization patterns
 */
export declare function analyzeUtilization(cpuMetrics: CloudWatchDatapoint[], memoryMetrics?: CloudWatchDatapoint[], analysisDays?: number): UtilizationMetrics;
/**
 * Calculate optimal auto-scaling configuration based on utilization patterns
 */
export declare function calculateAutoScalingConfig(metrics: UtilizationMetrics): AutoScalingConfig;
/**
 * Classify waste and generate ML recommendation
 */
export declare function classifyWaste(metrics: UtilizationMetrics, resourceType: string, currentSize: string): MLRecommendation;
/**
 * Generate utilization patterns object for storage
 */
export declare function generateUtilizationPatterns(metrics: UtilizationMetrics): UtilizationPatterns;
/**
 * Determine implementation complexity based on recommendation type and resource
 */
export declare function getImplementationComplexity(recommendationType: string, resourceType: string): 'low' | 'medium' | 'high';
//# sourceMappingURL=waste-analyzer.d.ts.map