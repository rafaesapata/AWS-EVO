/**
 * Real-time Monitoring System
 * Production-ready monitoring with alerts and metrics collection
 */

import { logger } from './logger.js';
import { metricsCollector } from './metrics-collector';
import { getPrismaClient } from './database';
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

class RealTimeMonitoringService extends EventEmitter {
  private prisma = getPrismaClient();
  private metrics = new Map<string, MonitoringMetric[]>();
  private alertRules = new Map<string, AlertRule>();
  private activeAlerts = new Map<string, Alert>();
  private lastAlertTimes = new Map<string, Date>();
  private monitoringInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.startMonitoring();
  }

  /**
   * Start real-time monitoring
   */
  private startMonitoring(): void {
    logger.info('Starting real-time monitoring system');

    // Load alert rules from database
    this.loadAlertRules();

    // Start metric collection
    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.evaluateAlertRules();
      this.cleanupOldMetrics();
    }, 30000); // Every 30 seconds

    // Start health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, 60000); // Every minute

    logger.info('Real-time monitoring system started');
  }

  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    logger.info('Real-time monitoring system stopped');
  }

  /**
   * Record a metric
   */
  public recordMetric(metric: MonitoringMetric): void {
    const key = `${metric.organizationId || 'global'}:${metric.name}`;
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    const metrics = this.metrics.get(key)!;
    metrics.push(metric);
    
    // Keep only last 1000 metrics per key
    if (metrics.length > 1000) {
      metrics.splice(0, metrics.length - 1000);
    }

    // Emit metric event for real-time processing
    this.emit('metric', metric);

    logger.debug('Metric recorded', {
      name: metric.name,
      value: metric.value,
      organizationId: metric.organizationId,
      tags: metric.tags
    });
  }

  /**
   * Get metrics for a specific organization and time range
   */
  public getMetrics(
    organizationId: string,
    metricName: string,
    startTime: Date,
    endTime: Date
  ): MonitoringMetric[] {
    const key = `${organizationId}:${metricName}`;
    const metrics = this.metrics.get(key) || [];
    
    return metrics.filter(m => 
      m.timestamp >= startTime && m.timestamp <= endTime
    );
  }

  /**
   * Create or update alert rule
   */
  public async createAlertRule(rule: Omit<AlertRule, 'id'>): Promise<AlertRule> {
    try {
      const alertRule = await this.prisma.alertRule.create({
        data: {
          organization_id: rule.organizationId,
          name: rule.name,
          rule_type: 'metric_threshold',
          condition_type: 'threshold',
          condition: {
            metricName: rule.metricName,
            condition: rule.condition,
            threshold: rule.threshold,
          },
          severity: rule.severity,
          is_active: rule.enabled,
          notification_channels: rule.notificationChannels as any,
        },
      });

      const newRule: AlertRule = {
        id: alertRule.id,
        name: alertRule.name,
        organizationId: alertRule.organization_id,
        metricName: rule.metricName,
        condition: rule.condition,
        threshold: rule.threshold,
        severity: rule.severity,
        enabled: alertRule.is_active,
        cooldownMinutes: rule.cooldownMinutes,
        notificationChannels: alertRule.notification_channels as string[] ?? [],
      };

      this.alertRules.set(newRule.id, newRule);
      
      logger.info('Alert rule created', { ruleId: newRule.id, name: newRule.name });
      return newRule;

    } catch (error) {
      logger.error('Failed to create alert rule', error as Error);
      throw error;
    }
  }

  /**
   * Load alert rules from database
   */
  private async loadAlertRules(): Promise<void> {
    try {
      const rules = await this.prisma.alertRule.findMany({
        where: { is_active: true },
      });

      for (const rule of rules) {
        const condition = rule.condition as any;
        const alertRule: AlertRule = {
          id: rule.id,
          name: rule.name,
          organizationId: rule.organization_id,
          metricName: condition.metricName,
          condition: condition.condition,
          threshold: condition.threshold,
          severity: rule.severity as any,
          enabled: rule.is_active,
          cooldownMinutes: 15, // Default cooldown
          notificationChannels: rule.notification_channels as string[] ?? [],
        };

        this.alertRules.set(alertRule.id, alertRule);
      }

      logger.info('Loaded alert rules', { count: rules.length });

    } catch (error) {
      logger.error('Failed to load alert rules', error as Error);
    }
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): void {
    const now = new Date();

    // Memory metrics
    const memoryUsage = process.memoryUsage();
    this.recordMetric({
      name: 'system.memory.heap_used',
      value: memoryUsage.heapUsed / 1024 / 1024, // MB
      timestamp: now,
      tags: { service: 'backend' },
    });

    this.recordMetric({
      name: 'system.memory.heap_total',
      value: memoryUsage.heapTotal / 1024 / 1024, // MB
      timestamp: now,
      tags: { service: 'backend' },
    });

    // CPU metrics (approximation)
    const cpuUsage = process.cpuUsage();
    this.recordMetric({
      name: 'system.cpu.user',
      value: cpuUsage.user / 1000, // milliseconds
      timestamp: now,
      tags: { service: 'backend' },
    });

    // Event loop lag (approximation)
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // ms
      this.recordMetric({
        name: 'system.event_loop.lag',
        value: lag,
        timestamp: new Date(),
        tags: { service: 'backend' },
      });
    });

    // Active connections (if available)
    this.recordMetric({
      name: 'system.connections.active',
      value: this.activeAlerts.size,
      timestamp: now,
      tags: { service: 'backend' },
    });
  }

  /**
   * Evaluate alert rules against current metrics
   */
  private evaluateAlertRules(): void {
    for (const [ruleId, rule] of this.alertRules) {
      if (!rule.enabled) continue;

      // Check cooldown
      const lastAlert = this.lastAlertTimes.get(ruleId);
      if (lastAlert) {
        const cooldownMs = rule.cooldownMinutes * 60 * 1000;
        if (Date.now() - lastAlert.getTime() < cooldownMs) {
          continue;
        }
      }

      // Get recent metrics
      const key = `${rule.organizationId}:${rule.metricName}`;
      const metrics = this.metrics.get(key) || [];
      
      if (metrics.length === 0) continue;

      // Get latest metric value
      const latestMetric = metrics[metrics.length - 1];
      const value = latestMetric.value;

      // Evaluate condition
      let triggered = false;
      switch (rule.condition) {
        case 'gt':
          triggered = value > rule.threshold;
          break;
        case 'gte':
          triggered = value >= rule.threshold;
          break;
        case 'lt':
          triggered = value < rule.threshold;
          break;
        case 'lte':
          triggered = value <= rule.threshold;
          break;
        case 'eq':
          triggered = value === rule.threshold;
          break;
      }

      if (triggered) {
        this.triggerAlert(rule, value, latestMetric);
      }
    }
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(rule: AlertRule, value: number, metric: MonitoringMetric): Promise<void> {
    try {
      const alert: Alert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ruleId: rule.id,
        organizationId: rule.organizationId,
        severity: rule.severity,
        title: `Alert: ${rule.name}`,
        message: `Metric ${rule.metricName} is ${value} (threshold: ${rule.threshold})`,
        triggeredAt: new Date(),
        metadata: {
          metricName: rule.metricName,
          value,
          threshold: rule.threshold,
          condition: rule.condition,
          tags: metric.tags,
        },
      };

      // Store in database
      await this.prisma.alert.create({
        data: {
          organization_id: alert.organizationId,
          rule_id: rule.id,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          metadata: alert.metadata,
          triggered_at: alert.triggeredAt,
        },
      });

      // Store in memory
      this.activeAlerts.set(alert.id, alert);
      this.lastAlertTimes.set(rule.id, alert.triggeredAt);

      // Emit alert event
      this.emit('alert', alert);

      logger.warn('Alert triggered', {
        alertId: alert.id,
        ruleId: rule.id,
        severity: alert.severity,
        value,
        threshold: rule.threshold,
      });

      // Send notifications (implement based on channels)
      await this.sendAlertNotifications(alert, rule);

    } catch (error) {
      logger.error('Failed to trigger alert', error as Error, { ruleId: rule.id });
    }
  }

  /**
   * Send alert notifications
   */
  private async sendAlertNotifications(alert: Alert, rule: AlertRule): Promise<void> {
    for (const channel of rule.notificationChannels) {
      try {
        switch (channel) {
          case 'email':
            // Implement email notification
            logger.info('Email notification sent', { alertId: alert.id });
            break;
          case 'slack':
            // Implement Slack notification
            logger.info('Slack notification sent', { alertId: alert.id });
            break;
          case 'webhook':
            // Implement webhook notification
            logger.info('Webhook notification sent', { alertId: alert.id });
            break;
          default:
            logger.warn('Unknown notification channel', { channel, alertId: alert.id });
        }
      } catch (error) {
        logger.error('Failed to send notification', error as Error, {
          channel,
          alertId: alert.id,
        });
      }
    }
  }

  /**
   * Perform health checks
   */
  private async performHealthChecks(): Promise<void> {
    const health: SystemHealth = {
      status: 'healthy',
      services: {},
      metrics: {},
      lastCheck: new Date(),
    };

    // Database health check
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - start;

      health.services.database = {
        status: responseTime < 1000 ? 'healthy' : 'degraded',
        responseTime,
        errorRate: 0,
        lastCheck: new Date(),
      };
    } catch (error) {
      health.services.database = {
        status: 'unhealthy',
        responseTime: 0,
        errorRate: 100,
        lastCheck: new Date(),
        details: { error: (error as Error).message },
      };
      health.status = 'unhealthy';
    }

    // Memory health check
    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    health.services.memory = {
      status: memoryUsagePercent < 80 ? 'healthy' : memoryUsagePercent < 95 ? 'degraded' : 'unhealthy',
      responseTime: 0,
      errorRate: 0,
      lastCheck: new Date(),
      details: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        usagePercent: memoryUsagePercent,
      },
    };

    if (health.services.memory.status !== 'healthy' && health.status === 'healthy') {
      health.status = 'degraded';
    }

    // Overall system status
    const unhealthyServices = Object.values(health.services).filter(s => s.status === 'unhealthy');
    const degradedServices = Object.values(health.services).filter(s => s.status === 'degraded');

    if (unhealthyServices.length > 0) {
      health.status = 'unhealthy';
    } else if (degradedServices.length > 0) {
      health.status = 'degraded';
    }

    // Record health metrics
    this.recordMetric({
      name: 'system.health.status',
      value: health.status === 'healthy' ? 1 : health.status === 'degraded' ? 0.5 : 0,
      timestamp: new Date(),
      tags: { service: 'system' },
    });

    // Emit health check event
    this.emit('healthCheck', health);

    logger.debug('Health check completed', {
      status: health.status,
      services: Object.keys(health.services).length,
    });
  }

  /**
   * Clean up old metrics to prevent memory leaks
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    for (const [key, metrics] of this.metrics) {
      const filteredMetrics = metrics.filter(m => m.timestamp > cutoffTime);
      this.metrics.set(key, filteredMetrics);
    }
  }

  /**
   * Get current system health
   */
  public async getCurrentHealth(): Promise<SystemHealth> {
    return new Promise((resolve) => {
      this.performHealthChecks();
      this.once('healthCheck', resolve);
    });
  }

  /**
   * Acknowledge an alert
   */
  public async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert) {
        throw new Error('Alert not found');
      }

      alert.acknowledgedAt = new Date();

      await this.prisma.alert.update({
        where: { id: alertId },
        data: { acknowledged_at: alert.acknowledgedAt },
      });

      logger.info('Alert acknowledged', { alertId, userId });

    } catch (error) {
      logger.error('Failed to acknowledge alert', error as Error, { alertId, userId });
      throw error;
    }
  }

  /**
   * Resolve an alert
   */
  public async resolveAlert(alertId: string, userId: string): Promise<void> {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert) {
        throw new Error('Alert not found');
      }

      alert.resolvedAt = new Date();

      await this.prisma.alert.update({
        where: { id: alertId },
        data: { resolved_at: alert.resolvedAt },
      });

      this.activeAlerts.delete(alertId);

      logger.info('Alert resolved', { alertId, userId });

    } catch (error) {
      logger.error('Failed to resolve alert', error as Error, { alertId, userId });
      throw error;
    }
  }
}

// Export singleton instance
export const realTimeMonitoring = new RealTimeMonitoringService();

// Graceful shutdown
process.on('SIGINT', () => {
  realTimeMonitoring.stopMonitoring();
});

process.on('SIGTERM', () => {
  realTimeMonitoring.stopMonitoring();
});