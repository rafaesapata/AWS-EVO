/**
 * Comprehensive Monitoring and Alerting System
 * Provides real-time monitoring, metrics collection, and intelligent alerting
 */
export interface MetricData {
    name: string;
    value: number;
    unit: MetricUnit;
    timestamp: Date;
    dimensions?: Record<string, string>;
    namespace?: string;
}
export type MetricUnit = 'Seconds' | 'Microseconds' | 'Milliseconds' | 'Bytes' | 'Kilobytes' | 'Megabytes' | 'Gigabytes' | 'Count' | 'Percent' | 'Count/Second' | 'Bytes/Second' | 'None';
export interface AlertRule {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    metric: string;
    namespace: string;
    statistic: 'Average' | 'Sum' | 'Maximum' | 'Minimum' | 'SampleCount';
    threshold: number;
    comparisonOperator: 'GreaterThanThreshold' | 'LessThanThreshold' | 'GreaterThanOrEqualToThreshold' | 'LessThanOrEqualToThreshold';
    evaluationPeriods: number;
    period: number;
    severity: AlertSeverity;
    actions: AlertAction[];
    suppressionRules?: SuppressionRule[];
}
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export interface AlertAction {
    type: 'email' | 'sms' | 'webhook' | 'sns' | 'slack' | 'pagerduty';
    target: string;
    template?: string;
}
export interface SuppressionRule {
    type: 'time_based' | 'condition_based' | 'escalation_based';
    config: Record<string, any>;
}
export interface Alert {
    id: string;
    ruleId: string;
    timestamp: Date;
    severity: AlertSeverity;
    status: 'active' | 'acknowledged' | 'resolved' | 'suppressed';
    metric: string;
    currentValue: number;
    threshold: number;
    message: string;
    details: Record<string, any>;
    acknowledgedBy?: string;
    acknowledgedAt?: Date;
    resolvedAt?: Date;
}
export interface HealthCheck {
    name: string;
    type: 'http' | 'tcp' | 'database' | 'custom';
    config: Record<string, any>;
    interval: number;
    timeout: number;
    retries: number;
    enabled: boolean;
}
export interface HealthStatus {
    name: string;
    status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
    lastCheck: Date;
    responseTime: number;
    message?: string;
    details?: Record<string, any>;
}
/**
 * Metrics Collector
 */
export declare class MetricsCollector {
    private cloudWatchClient;
    private metricsBuffer;
    private bufferSize;
    private flushInterval;
    private flushTimer?;
    constructor();
    /**
     * Record a metric
     */
    recordMetric(name: string, value: number, unit?: MetricUnit, dimensions?: Record<string, string>, namespace?: string): Promise<void>;
    /**
     * Record multiple metrics at once
     */
    recordMetrics(metrics: Omit<MetricData, 'timestamp'>[]): Promise<void>;
    /**
     * Flush metrics to CloudWatch
     */
    flush(): Promise<void>;
    /**
     * Start automatic flushing
     */
    private startAutoFlush;
    /**
     * Stop automatic flushing
     */
    destroy(): void;
}
/**
 * Alert Manager
 */
export declare class AlertManager {
    private snsClient;
    private rules;
    private activeAlerts;
    private suppressedAlerts;
    constructor();
    /**
     * Add alert rule
     */
    addRule(rule: AlertRule): void;
    /**
     * Remove alert rule
     */
    removeRule(ruleId: string): void;
    /**
     * Evaluate metrics against alert rules
     */
    evaluateMetric(metric: MetricData): Promise<void>;
    /**
     * Trigger an alert
     */
    private triggerAlert;
    /**
     * Resolve an alert
     */
    private resolveAlert;
    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void>;
    /**
     * Execute alert action
     */
    private executeAlertAction;
    private sendSNSAlert;
    private sendEmailAlert;
    private sendWebhookAlert;
    private sendSlackAlert;
    private evaluateThreshold;
    private isAlertSuppressed;
    private evaluateSuppressionRule;
    private generateAlertMessage;
    private formatAlertMessage;
    private formatSlackMessage;
    private loadDefaultRules;
    /**
     * Get active alerts
     */
    getActiveAlerts(): Alert[];
    /**
     * Get alert history
     */
    getAlertHistory(limit?: number): Alert[];
}
/**
 * Health Monitor
 */
export declare class HealthMonitor {
    private healthChecks;
    private healthStatuses;
    private checkTimers;
    /**
     * Add health check
     */
    addHealthCheck(check: HealthCheck): void;
    /**
     * Remove health check
     */
    removeHealthCheck(name: string): void;
    /**
     * Start health check
     */
    private startHealthCheck;
    /**
     * Stop health check
     */
    private stopHealthCheck;
    /**
     * Perform health check
     */
    private performHealthCheck;
    /**
     * Execute specific health check
     */
    private executeHealthCheck;
    private executeHttpHealthCheck;
    private executeDatabaseHealthCheck;
    private testDatabaseConnection;
    checkExternalServices(): Promise<{
        healthy: boolean;
        message: string;
        details: Record<string, any>;
    }>;
    private executeTcpHealthCheck;
    private executeCustomHealthCheck;
    /**
     * Get overall system health
     */
    getSystemHealth(): {
        status: 'healthy' | 'degraded' | 'unhealthy';
        checks: HealthStatus[];
        summary: {
            total: number;
            healthy: number;
            unhealthy: number;
            degraded: number;
        };
    };
    /**
     * Destroy health monitor
     */
    destroy(): void;
}
export declare const metricsCollector: MetricsCollector;
export declare const alertManager: AlertManager;
export declare const healthMonitor: HealthMonitor;
/**
 * Middleware for automatic metrics collection
 */
export declare function withMetrics(handler: (event: any, context: any) => Promise<any>, metricName?: string): (event: any, context: any) => Promise<any>;
//# sourceMappingURL=monitoring-alerting.d.ts.map