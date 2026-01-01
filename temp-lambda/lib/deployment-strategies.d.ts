/**
 * Comprehensive Deployment Strategies System
 * Provides blue-green, canary, and rolling deployment capabilities
 */
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { Route53Client } from '@aws-sdk/client-route-53';
export interface DeploymentConfig {
    strategy: DeploymentStrategy;
    environment: string;
    version: string;
    rollbackOnFailure: boolean;
    healthCheckUrl?: string;
    healthCheckTimeout: number;
    healthCheckRetries: number;
    notifications: NotificationConfig[];
    approvals?: ApprovalConfig[];
}
export type DeploymentStrategy = 'blue_green' | 'canary' | 'rolling' | 'all_at_once' | 'immutable';
export interface NotificationConfig {
    type: 'sns' | 'email' | 'slack' | 'webhook';
    target: string;
    events: DeploymentEvent[];
}
export interface ApprovalConfig {
    stage: 'pre_deployment' | 'post_deployment' | 'rollback';
    approvers: string[];
    timeout: number;
    required: boolean;
}
export type DeploymentEvent = 'deployment_started' | 'deployment_completed' | 'deployment_failed' | 'rollback_started' | 'rollback_completed' | 'health_check_failed' | 'approval_required';
export interface DeploymentStatus {
    id: string;
    strategy: DeploymentStrategy;
    environment: string;
    version: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back' | 'approval_required';
    startTime: Date;
    endTime?: Date;
    progress: number;
    stages: DeploymentStage[];
    healthChecks: HealthCheckResult[];
    rollbackInfo?: RollbackInfo;
    approvals: ApprovalStatus[];
}
export interface DeploymentStage {
    name: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
    startTime?: Date;
    endTime?: Date;
    logs: string[];
    metrics?: Record<string, number>;
}
export interface HealthCheckResult {
    timestamp: Date;
    url: string;
    status: 'success' | 'failure';
    responseTime: number;
    statusCode?: number;
    error?: string;
}
export interface RollbackInfo {
    reason: string;
    previousVersion: string;
    rollbackTime: Date;
    automatic: boolean;
}
export interface ApprovalStatus {
    stage: ApprovalConfig['stage'];
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    approver?: string;
    timestamp?: Date;
    comments?: string;
}
/**
 * Abstract Deployment Strategy
 */
export declare abstract class BaseDeploymentStrategy {
    protected cloudFormationClient: CloudFormationClient;
    protected lambdaClient: LambdaClient;
    protected route53Client: Route53Client;
    constructor();
    abstract deploy(config: DeploymentConfig): Promise<DeploymentStatus>;
    abstract rollback(deploymentId: string, reason: string): Promise<boolean>;
    abstract getStatus(deploymentId: string): Promise<DeploymentStatus>;
    protected generateDeploymentId(): string;
    protected performHealthCheck(url: string, timeout?: number): Promise<HealthCheckResult>;
    protected waitForApproval(deploymentId: string, approval: ApprovalConfig): Promise<ApprovalStatus>;
    protected sendNotification(config: NotificationConfig, event: DeploymentEvent, deploymentStatus: DeploymentStatus): Promise<void>;
    protected recordDeploymentMetrics(deploymentStatus: DeploymentStatus, stage: string, success: boolean): Promise<void>;
}
/**
 * Blue-Green Deployment Strategy
 */
export declare class BlueGreenDeploymentStrategy extends BaseDeploymentStrategy {
    deploy(config: DeploymentConfig): Promise<DeploymentStatus>;
    rollback(deploymentId: string, reason: string): Promise<boolean>;
    getStatus(deploymentId: string): Promise<DeploymentStatus>;
    private deploymentCache;
    private deployToGreenEnvironment;
    private performHealthChecks;
    private switchTraffic;
    private cleanupBlueEnvironment;
}
/**
 * Canary Deployment Strategy
 */
export declare class CanaryDeploymentStrategy extends BaseDeploymentStrategy {
    deploy(config: DeploymentConfig): Promise<DeploymentStatus>;
    rollback(deploymentId: string, reason: string): Promise<boolean>;
    getStatus(deploymentId: string): Promise<DeploymentStatus>;
    private deploymentCache;
    private deployCanary;
    private analyzeCanary;
    private deployFull;
}
/**
 * Deployment Manager - Orchestrates all deployment strategies
 */
export declare class DeploymentManager {
    private strategies;
    private activeDeployments;
    constructor();
    private initializeStrategies;
    deploy(config: DeploymentConfig): Promise<DeploymentStatus>;
    rollback(deploymentId: string, reason: string): Promise<boolean>;
    getDeploymentStatus(deploymentId: string): Promise<DeploymentStatus | null>;
    getActiveDeployments(): DeploymentStatus[];
    getDeploymentHistory(limit?: number): DeploymentStatus[];
}
export declare const deploymentManager: DeploymentManager;
export declare const DEPLOYMENT_CONFIGS: {
    readonly PRODUCTION: {
        readonly strategy: DeploymentStrategy;
        readonly rollbackOnFailure: true;
        readonly healthCheckTimeout: 30000;
        readonly healthCheckRetries: 3;
        readonly notifications: readonly [{
            readonly type: "sns";
            readonly target: string;
            readonly events: DeploymentEvent[];
        }];
        readonly approvals: readonly [{
            readonly stage: "pre_deployment";
            readonly approvers: readonly ["ops-team@evo-uds.com"];
            readonly timeout: 60;
            readonly required: true;
        }];
    };
    readonly STAGING: {
        readonly strategy: DeploymentStrategy;
        readonly rollbackOnFailure: true;
        readonly healthCheckTimeout: 15000;
        readonly healthCheckRetries: 2;
        readonly notifications: readonly [{
            readonly type: "slack";
            readonly target: "#deployments";
            readonly events: DeploymentEvent[];
        }];
    };
    readonly DEVELOPMENT: {
        readonly strategy: DeploymentStrategy;
        readonly rollbackOnFailure: false;
        readonly healthCheckTimeout: 10000;
        readonly healthCheckRetries: 1;
        readonly notifications: readonly [];
    };
};
//# sourceMappingURL=deployment-strategies.d.ts.map