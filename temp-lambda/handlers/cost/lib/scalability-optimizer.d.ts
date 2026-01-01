/**
 * Scalability Optimizer
 * Military-grade auto-scaling and resource optimization system
 */
import { EventEmitter } from 'events';
export interface ScalingPolicy {
    id: string;
    name: string;
    resourceType: 'lambda' | 'rds' | 'ec2' | 'ecs' | 'api_gateway' | 'cloudfront';
    organizationId?: string;
    triggers: ScalingTrigger[];
    actions: ScalingAction[];
    cooldownPeriod: number;
    enabled: boolean;
    createdAt: Date;
    lastTriggered?: Date;
}
export interface ScalingTrigger {
    id: string;
    metric: string;
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
    threshold: number;
    duration: number;
    aggregation: 'avg' | 'max' | 'min' | 'sum';
}
export interface ScalingAction {
    id: string;
    type: 'scale_up' | 'scale_down' | 'scale_out' | 'scale_in' | 'optimize' | 'alert';
    parameters: Record<string, any>;
    priority: number;
}
export interface ResourceMetrics {
    resourceId: string;
    resourceType: string;
    timestamp: Date;
    metrics: {
        cpu_utilization?: number;
        memory_utilization?: number;
        network_in?: number;
        network_out?: number;
        request_count?: number;
        error_rate?: number;
        response_time?: number;
        concurrent_executions?: number;
        database_connections?: number;
        queue_depth?: number;
    };
    organizationId?: string;
}
export interface ScalingEvent {
    id: string;
    policyId: string;
    resourceId: string;
    triggerId: string;
    actionId: string;
    timestamp: Date;
    status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
    details: {
        triggerValue: number;
        threshold: number;
        action: string;
        parameters: Record<string, any>;
    };
    result?: {
        success: boolean;
        message: string;
        newCapacity?: number;
        executionTime: number;
    };
    organizationId?: string;
}
export interface CapacityPrediction {
    resourceId: string;
    resourceType: string;
    currentCapacity: number;
    predictedDemand: Array<{
        timestamp: Date;
        demand: number;
        confidence: number;
    }>;
    recommendations: Array<{
        action: 'increase' | 'decrease' | 'maintain';
        targetCapacity: number;
        reasoning: string;
        costImpact: number;
        riskLevel: 'low' | 'medium' | 'high';
    }>;
    generatedAt: Date;
}
export interface OptimizationReport {
    organizationId: string;
    reportPeriod: {
        start: Date;
        end: Date;
    };
    summary: {
        totalScalingEvents: number;
        successfulScalings: number;
        failedScalings: number;
        costSavings: number;
        performanceImprovement: number;
        availabilityImprovement: number;
    };
    resourceOptimizations: Array<{
        resourceId: string;
        resourceType: string;
        optimizationType: string;
        impact: {
            costSaving: number;
            performanceGain: number;
            reliabilityImprovement: number;
        };
        recommendation: string;
    }>;
    predictiveInsights: Array<{
        insight: string;
        confidence: number;
        timeframe: string;
        actionRequired: boolean;
    }>;
}
export declare class ScalabilityOptimizer extends EventEmitter {
    private prisma;
    private scalingPolicies;
    private activeScalingEvents;
    private resourceMetrics;
    private monitoringInterval?;
    private readonly METRICS_RETENTION_HOURS;
    private readonly MAX_METRICS_PER_RESOURCE;
    constructor();
    /**
     * Initialize default scaling policies
     */
    private initializeDefaultPolicies;
    /**
     * Create a new scaling policy
     */
    createScalingPolicy(policy: Omit<ScalingPolicy, 'createdAt'>): ScalingPolicy;
    /**
     * Record resource metrics
     */
    recordResourceMetrics(metrics: ResourceMetrics): void;
    /**
     * Evaluate scaling triggers for resource metrics
     */
    private evaluateScalingTriggers;
    /**
     * Evaluate individual trigger
     */
    private evaluateTrigger;
    /**
     * Execute scaling actions
     */
    private executeScalingActions;
    /**
     * Execute individual scaling action
     */
    private executeScalingAction;
    /**
     * Scaling action implementations
     */
    private performScaleUp;
    private performScaleDown;
    private performScaleOut;
    private performScaleIn;
    private performOptimization;
    private sendScalingAlert;
    /**
     * Generate capacity predictions using ML
     */
    generateCapacityPrediction(resourceId: string, resourceType: string, organizationId?: string): Promise<CapacityPrediction>;
    /**
     * Generate optimization report
     */
    generateOptimizationReport(organizationId: string, reportPeriod: {
        start: Date;
        end: Date;
    }): Promise<OptimizationReport>;
    /**
     * Start scaling monitoring
     */
    private startScalingMonitoring;
    /**
     * Cleanup old metrics
     */
    private cleanupOldMetrics;
    /**
     * Monitor scaling health
     */
    private monitorScalingHealth;
    /**
     * Get scaling policies
     */
    getScalingPolicies(organizationId?: string): ScalingPolicy[];
    /**
     * Get scaling events
     */
    getScalingEvents(organizationId?: string): ScalingEvent[];
    /**
     * Cleanup resources
     */
    cleanup(): void;
}
export declare const scalabilityOptimizer: ScalabilityOptimizer;
//# sourceMappingURL=scalability-optimizer.d.ts.map