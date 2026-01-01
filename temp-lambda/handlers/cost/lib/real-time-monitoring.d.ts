/**
 * Real-time Monitoring System
 * Production-ready monitoring with alerts and metrics collection
 */
import { EventEmitter } from 'events';
export interface MonitoringMetric {
    name: string;
    value: number;
    timestamp: Date;
    tags: Record<string, string>;
    organizationId?: string;
}
export interface AlertRule {
    id: string;
    name: string;
    organizationId: string;
    metricName: string;
    condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    threshold: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
    enabled: boolean;
    cooldownMinutes: number;
    notificationChannels: string[];
}
export interface Alert {
    id: string;
    ruleId: string;
    organizationId: string;
    severity: string;
    title: string;
    message: string;
    triggeredAt: Date;
    acknowledgedAt?: Date;
    resolvedAt?: Date;
    metadata: Record<string, any>;
}
export interface SystemHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, ServiceHealth>;
    metrics: Record<string, number>;
    lastCheck: Date;
}
export interface ServiceHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime: number;
    errorRate: number;
    lastCheck: Date;
    details?: Record<string, any>;
}
declare class RealTimeMonitoringService extends EventEmitter {
    private prisma;
    private metrics;
    private alertRules;
    private activeAlerts;
    private lastAlertTimes;
    private monitoringInterval?;
    private healthCheckInterval?;
    constructor();
    /**
     * Start real-time monitoring
     */
    private startMonitoring;
    /**
     * Stop monitoring
     */
    stopMonitoring(): void;
    /**
     * Record a metric
     */
    recordMetric(metric: MonitoringMetric): void;
    /**
     * Get metrics for a specific organization and time range
     */
    getMetrics(organizationId: string, metricName: string, startTime: Date, endTime: Date): MonitoringMetric[];
    /**
     * Create or update alert rule
     */
    createAlertRule(rule: Omit<AlertRule, 'id'>): Promise<AlertRule>;
    /**
     * Load alert rules from database
     */
    private loadAlertRules;
    /**
     * Collect system metrics
     */
    private collectSystemMetrics;
    /**
     * Evaluate alert rules against current metrics
     */
    private evaluateAlertRules;
    /**
     * Trigger an alert
     */
    private triggerAlert;
    /**
     * Send alert notifications
     */
    private sendAlertNotifications;
    /**
     * Perform health checks
     */
    private performHealthChecks;
    /**
     * Clean up old metrics to prevent memory leaks
     */
    private cleanupOldMetrics;
    /**
     * Get current system health
     */
    getCurrentHealth(): Promise<SystemHealth>;
    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId: string, userId: string): Promise<void>;
    /**
     * Resolve an alert
     */
    resolveAlert(alertId: string, userId: string): Promise<void>;
}
export declare const realTimeMonitoring: RealTimeMonitoringService;
export {};
//# sourceMappingURL=real-time-monitoring.d.ts.map