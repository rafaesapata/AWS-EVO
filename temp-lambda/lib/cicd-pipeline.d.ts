/**
 * Comprehensive CI/CD Pipeline System
 * Provides automated build, test, security scanning, and deployment capabilities
 */
export interface PipelineConfig {
    name: string;
    triggers: PipelineTrigger[];
    stages: PipelineStage[];
    environment: PipelineEnvironment;
    notifications: NotificationConfig[];
    security: SecurityConfig;
    quality: QualityGates;
    artifacts: ArtifactConfig;
}
export interface PipelineTrigger {
    type: TriggerType;
    config: Record<string, any>;
}
export type TriggerType = 'push' | 'pull_request' | 'schedule' | 'manual' | 'webhook';
export interface PipelineStage {
    name: string;
    type: StageType;
    dependsOn?: string[];
    condition?: string;
    timeout: number;
    retries: number;
    config: Record<string, any>;
    artifacts?: {
        input?: string[];
        output?: string[];
    };
}
export type StageType = 'checkout' | 'build' | 'test' | 'security_scan' | 'quality_check' | 'package' | 'deploy' | 'notify' | 'cleanup';
export interface PipelineEnvironment {
    name: string;
    variables: Record<string, string>;
    secrets: string[];
    resources: {
        cpu: string;
        memory: string;
        disk: string;
    };
}
export interface NotificationConfig {
    type: 'email' | 'slack' | 'teams' | 'webhook';
    target: string;
    events: PipelineEvent[];
    template?: string;
}
export type PipelineEvent = 'started' | 'completed' | 'failed' | 'stage_completed' | 'stage_failed' | 'quality_gate_failed' | 'security_issue_found';
export interface SecurityConfig {
    enabled: boolean;
    scanCode: boolean;
    scanDependencies: boolean;
    scanContainer: boolean;
    scanInfrastructure: boolean;
    failOnCritical: boolean;
    failOnHigh: boolean;
}
export interface QualityGates {
    enabled: boolean;
    coverage: {
        minimum: number;
        fail: boolean;
    };
    duplication: {
        maximum: number;
        fail: boolean;
    };
    maintainability: {
        minimum: string;
        fail: boolean;
    };
    reliability: {
        minimum: string;
        fail: boolean;
    };
    security: {
        minimum: string;
        fail: boolean;
    };
}
export interface ArtifactConfig {
    enabled: boolean;
    retention: number;
    storage: 'local' | 's3' | 'artifactory';
    compression: boolean;
    encryption: boolean;
}
export interface PipelineExecution {
    id: string;
    pipelineId: string;
    trigger: PipelineTrigger;
    startTime: Date;
    endTime?: Date;
    status: PipelineStatus;
    stages: StageExecution[];
    artifacts: PipelineArtifact[];
    logs: PipelineLog[];
    metrics: PipelineMetrics;
}
export type PipelineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped';
export interface StageExecution {
    name: string;
    startTime: Date;
    endTime?: Date;
    status: PipelineStatus;
    duration?: number;
    logs: string[];
    artifacts: string[];
    error?: string;
    retryCount: number;
}
export interface PipelineArtifact {
    id: string;
    name: string;
    type: ArtifactType;
    path: string;
    size: number;
    checksum: string;
    createdAt: Date;
    metadata: Record<string, any>;
}
export type ArtifactType = 'source_code' | 'build_output' | 'test_results' | 'security_report' | 'quality_report' | 'container_image' | 'deployment_package';
export interface PipelineLog {
    timestamp: Date;
    level: 'debug' | 'info' | 'warn' | 'error';
    stage: string;
    message: string;
    metadata?: Record<string, any>;
}
export interface PipelineMetrics {
    totalDuration: number;
    stageMetrics: Record<string, {
        duration: number;
        successRate: number;
        averageDuration: number;
    }>;
    resourceUsage: {
        cpu: number;
        memory: number;
        disk: number;
    };
}
/**
 * Pipeline Stage Executor
 */
export declare abstract class StageExecutor {
    abstract execute(stage: PipelineStage, context: PipelineContext): Promise<StageResult>;
}
export interface PipelineContext {
    executionId: string;
    workingDirectory: string;
    environment: PipelineEnvironment;
    artifacts: Map<string, PipelineArtifact>;
    variables: Map<string, string>;
}
export interface StageResult {
    success: boolean;
    duration: number;
    logs: string[];
    artifacts: PipelineArtifact[];
    error?: string;
    metadata?: Record<string, any>;
}
/**
 * Build Stage Executor
 */
export declare class BuildStageExecutor extends StageExecutor {
    execute(stage: PipelineStage, context: PipelineContext): Promise<StageResult>;
    private runCommand;
    private runCommandWithStreaming;
    private calculateRealCoverage;
}
/**
 * Test Stage Executor
 */
export declare class TestStageExecutor extends StageExecutor {
    execute(stage: PipelineStage, context: PipelineContext): Promise<StageResult>;
}
/**
 * Security Scan Stage Executor
 */
export declare class SecurityScanStageExecutor extends StageExecutor {
    execute(stage: PipelineStage, context: PipelineContext): Promise<StageResult>;
}
/**
 * Deploy Stage Executor
 */
export declare class DeployStageExecutor extends StageExecutor {
    execute(stage: PipelineStage, context: PipelineContext): Promise<StageResult>;
}
/**
 * Pipeline Engine - Main orchestrator
 */
export declare class PipelineEngine {
    private executors;
    private executions;
    constructor();
    private initializeExecutors;
    /**
     * Execute pipeline
     */
    executePipeline(config: PipelineConfig, trigger: PipelineTrigger, variables?: Record<string, string>): Promise<PipelineExecution>;
    /**
     * Execute single stage
     */
    private executeStage;
    /**
     * Check if stage should be executed based on conditions
     */
    private shouldExecuteStage;
    /**
     * Get pipeline execution
     */
    getExecution(executionId: string): PipelineExecution | undefined;
    /**
     * Get pipeline executions
     */
    getExecutions(pipelineId?: string): PipelineExecution[];
    /**
     * Cancel pipeline execution
     */
    cancelExecution(executionId: string): Promise<boolean>;
}
export declare const DEFAULT_PIPELINE_CONFIGS: Record<string, PipelineConfig>;
export declare const pipelineEngine: PipelineEngine;
export declare function triggerPipeline(pipelineName: string, trigger: PipelineTrigger, variables?: Record<string, string>): Promise<PipelineExecution>;
export declare function getPipelineStatus(executionId: string): PipelineExecution | undefined;
export declare const GITHUB_ACTIONS_WORKFLOW: string;
//# sourceMappingURL=cicd-pipeline.d.ts.map