/**
 * Advanced Monitoring System
 * Comprehensive application monitoring with real-time alerts and analytics
 */

import { logger } from './logging';
import { metricsCollector } from './metrics-collector';
import { healthCheckManager } from './health-checks';

export interface MonitoringConfig {
  enableRealTimeMonitoring: boolean;
  enablePerformanceMonitoring: boolean;
  enableErrorTracking: boolean;
  enableUserAnalytics: boolean;
  enableBusinessMetrics: boolean;
  alertThresholds: AlertThresholds;
  samplingRate: number;
  retentionDays: number;
}

export interface AlertThresholds {
  errorRate: number; // Percentage
  responseTime: number; // Milliseconds
  memoryUsage: number; // Percentage
  cpuUsage: number; // Percentage
  diskUsage: number; // Percentage
  activeUsers: number; // Count
  failedLogins: number; // Count per minute
}

export interface MonitoringEvent {
  id: string;
  timestamp: Date;
  type: MonitoringEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  message: string;
  metadata: Record<string, any>;
  userId?: string;
  organizationId?: string;
  sessionId?: string;
}

export enum MonitoringEventType {
  ERROR = 'error',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  BUSINESS = 'business',
  USER_ACTION = 'user_action',
  SYSTEM = 'system',
  ALERT = 'alert',
}

export interface PerformanceMetrics {
  responseTime: number;
  throughput: number;
  errorRate: number;
  memoryUsage: number;
  cpuUsage: number;
  activeConnections: number;
  queueSize: number;
  cacheHitRate: number;
}

export interface UserAnalytics {
  activeUsers: number;
  newUsers: number;
  sessionDuration: number;
  pageViews: number;
  bounceRate: number;
  conversionRate: number;
  featureUsage: Record<string, number>;
}

export interface BusinessMetrics {
  securityScansRun: number;
  findingsGenerated: number;
  costSavingsIdentified: number;
  accountsMonitored: number;
  alertsTriggered: number;
  userSatisfactionScore: number;
}

/**
 * Advanced Monitoring Manager
 */
export class AdvancedMonitoringManager {
  private config: MonitoringConfig;
  private events: MonitoringEvent[] = [];
  private alerts: Map<string, Date> = new Map();
  private performanceBuffer: PerformanceMetrics[] = [];
  private userAnalyticsBuffer: UserAnalytics[] = [];
  private businessMetricsBuffer: BusinessMetrics[] = [];
  private isRunning = false;
  private intervalIds: ReturnType<typeof setInterval>[] = [];

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = {
      enableRealTimeMonitoring: true,
      enablePerformanceMonitoring: true,
      enableErrorTracking: true,
      enableUserAnalytics: true,
      enableBusinessMetrics: true,
      alertThresholds: {
        errorRate: 5, // 5%
        responseTime: 2000, // 2 seconds
        memoryUsage: 80, // 80%
        cpuUsage: 80, // 80%
        diskUsage: 85, // 85%
        activeUsers: 1000,
        failedLogins: 10,
      },
      samplingRate: 1.0, // 100%
      retentionDays: 30,
      ...config,
    };

    this.initialize();
  }

  /**
   * Initialize monitoring system
   */
  private async initialize(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // Start monitoring loops
    this.startPerformanceMonitoring();
    this.startUserAnalytics();
    this.startBusinessMetrics();
    this.startAlertProcessing();
    this.startDataRetention();

    // Set up error tracking
    if (this.config.enableErrorTracking) {
      this.setupErrorTracking();
    }

    // Set up real-time monitoring
    if (this.config.enableRealTimeMonitoring) {
      this.setupRealTimeMonitoring();
    }

    logger.info('Advanced monitoring system initialized', {
      config: this.config,
    });
  }

  /**
   * Record monitoring event
   */
  recordEvent(event: Omit<MonitoringEvent, 'id' | 'timestamp'>): void {
    // Apply sampling
    if (Math.random() > this.config.samplingRate) {
      return;
    }

    const monitoringEvent: MonitoringEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      ...event,
    };

    this.events.push(monitoringEvent);

    // Emit to real-time systems
    this.emitEvent(monitoringEvent);

    // Check for alerts
    this.checkAlerts(monitoringEvent);

    // Record metrics
    metricsCollector.record('monitoring_event', 1, {
      type: event.type,
      severity: event.severity,
      source: event.source,
    });

    logger.debug('Monitoring event recorded', {
      eventId: monitoringEvent.id,
      type: event.type,
      severity: event.severity,
    });
  }

  /**
   * Record performance metrics
   */
  recordPerformanceMetrics(metrics: PerformanceMetrics): void {
    if (!this.config.enablePerformanceMonitoring) return;

    this.performanceBuffer.push({
      ...metrics,
      timestamp: Date.now(),
    } as any);

    // Check performance thresholds
    this.checkPerformanceThresholds(metrics);

    // Record to metrics collector
    Object.entries(metrics).forEach(([key, value]) => {
      metricsCollector.record(`performance_${key}`, value);
    });
  }

  /**
   * Record user analytics
   */
  recordUserAnalytics(analytics: UserAnalytics): void {
    if (!this.config.enableUserAnalytics) return;

    this.userAnalyticsBuffer.push({
      ...analytics,
      timestamp: Date.now(),
    } as any);

    // Record to metrics collector
    Object.entries(analytics).forEach(([key, value]) => {
      if (typeof value === 'number') {
        metricsCollector.record(`user_analytics_${key}`, value);
      }
    });
  }

  /**
   * Record business metrics
   */
  recordBusinessMetrics(metrics: BusinessMetrics): void {
    if (!this.config.enableBusinessMetrics) return;

    this.businessMetricsBuffer.push({
      ...metrics,
      timestamp: Date.now(),
    } as any);

    // Record to metrics collector
    Object.entries(metrics).forEach(([key, value]) => {
      metricsCollector.record(`business_${key}`, value);
    });
  }

  /**
   * Get current system status
   */
  async getSystemStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    performance: PerformanceMetrics;
    userAnalytics: UserAnalytics;
    businessMetrics: BusinessMetrics;
    recentEvents: MonitoringEvent[];
    activeAlerts: string[];
  }> {
    const healthCheck = await healthCheckManager.runAll();
    const recentPerformance = this.getRecentPerformanceMetrics();
    const recentUserAnalytics = this.getRecentUserAnalytics();
    const recentBusinessMetrics = this.getRecentBusinessMetrics();
    const recentEvents = this.getRecentEvents(50);
    const activeAlerts = Array.from(this.alerts.keys());

    return {
      status: healthCheck.status,
      performance: recentPerformance,
      userAnalytics: recentUserAnalytics,
      businessMetrics: recentBusinessMetrics,
      recentEvents,
      activeAlerts,
    };
  }

  /**
   * Get monitoring dashboard data
   */
  getDashboardData(timeRange: { start: Date; end: Date }): {
    events: MonitoringEvent[];
    performanceMetrics: PerformanceMetrics[];
    userAnalytics: UserAnalytics[];
    businessMetrics: BusinessMetrics[];
    alertsSummary: Record<string, number>;
  } {
    const events = this.events.filter(
      event => event.timestamp >= timeRange.start && event.timestamp <= timeRange.end
    );

    const performanceMetrics = this.performanceBuffer.filter(
      (metrics: any) => new Date(metrics.timestamp) >= timeRange.start && new Date(metrics.timestamp) <= timeRange.end
    );

    const userAnalytics = this.userAnalyticsBuffer.filter(
      (analytics: any) => new Date(analytics.timestamp) >= timeRange.start && new Date(analytics.timestamp) <= timeRange.end
    );

    const businessMetrics = this.businessMetricsBuffer.filter(
      (metrics: any) => new Date(metrics.timestamp) >= timeRange.start && new Date(metrics.timestamp) <= timeRange.end
    );

    const alertsSummary = events
      .filter(event => event.type === MonitoringEventType.ALERT)
      .reduce((acc, event) => {
        acc[event.severity] = (acc[event.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    return {
      events,
      performanceMetrics,
      userAnalytics,
      businessMetrics,
      alertsSummary,
    };
  }

  /**
   * Setup error tracking
   */
  private setupErrorTracking(): void {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.recordEvent({
        type: MonitoringEventType.ERROR,
        severity: 'high',
        source: 'window.error',
        message: event.message,
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
        },
      });
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.recordEvent({
        type: MonitoringEventType.ERROR,
        severity: 'high',
        source: 'unhandledrejection',
        message: event.reason?.message || 'Unhandled promise rejection',
        metadata: {
          reason: event.reason,
          stack: event.reason?.stack,
        },
      });
    });

    // React error boundary integration would go here
  }

  /**
   * Setup real-time monitoring
   */
  private setupRealTimeMonitoring(): void {
    // Performance observer for web vitals
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordEvent({
            type: MonitoringEventType.PERFORMANCE,
            severity: 'low',
            source: 'performance_observer',
            message: `${entry.entryType}: ${entry.name}`,
            metadata: {
              entryType: entry.entryType,
              name: entry.name,
              duration: entry.duration,
              startTime: entry.startTime,
            },
          });
        }
      });

      observer.observe({ entryTypes: ['navigation', 'resource', 'measure'] });
    }

    // Network monitoring
    if ('navigator' in window && 'connection' in navigator) {
      const connection = (navigator as any).connection;
      
      const recordNetworkInfo = () => {
        this.recordEvent({
          type: MonitoringEventType.SYSTEM,
          severity: 'low',
          source: 'network_monitor',
          message: 'Network status update',
          metadata: {
            effectiveType: connection.effectiveType,
            downlink: connection.downlink,
            rtt: connection.rtt,
            saveData: connection.saveData,
          },
        });
      };

      connection.addEventListener('change', recordNetworkInfo);
      recordNetworkInfo(); // Initial reading
    }
  }

  /**
   * Start performance monitoring loop
   */
  private startPerformanceMonitoring(): void {
    if (!this.config.enablePerformanceMonitoring) return;

    this.intervalIds.push(setInterval(() => {
      const metrics = this.collectPerformanceMetrics();
      this.recordPerformanceMetrics(metrics);
    }, 30000)); // Every 30 seconds
  }

  /**
   * Start user analytics loop
   */
  private startUserAnalytics(): void {
    if (!this.config.enableUserAnalytics) return;

    this.intervalIds.push(setInterval(() => {
      const analytics = this.collectUserAnalytics();
      this.recordUserAnalytics(analytics);
    }, 60000)); // Every minute
  }

  /**
   * Start business metrics loop
   */
  private startBusinessMetrics(): void {
    if (!this.config.enableBusinessMetrics) return;

    this.intervalIds.push(setInterval(() => {
      const metrics = this.collectBusinessMetrics();
      this.recordBusinessMetrics(metrics);
    }, 300000)); // Every 5 minutes
  }

  /**
   * Start alert processing loop
   */
  private startAlertProcessing(): void {
    this.intervalIds.push(setInterval(() => {
      this.processAlerts();
    }, 10000)); // Every 10 seconds
  }

  /**
   * Start data retention cleanup
   */
  private startDataRetention(): void {
    this.intervalIds.push(setInterval(() => {
      this.cleanupOldData();
    }, 3600000)); // Every hour
  }

  /**
   * Destroy monitoring manager and clean up all intervals
   */
  destroy(): void {
    this.intervalIds.forEach(id => clearInterval(id));
    this.intervalIds = [];
    this.events = [];
    this.performanceBuffer = [];
    this.userAnalyticsBuffer = [];
    this.businessMetricsBuffer = [];
    this.alerts.clear();
    this.isRunning = false;
    logger.info('Advanced monitoring system destroyed');
  }

  /**
   * Collect current performance metrics
   */
  private collectPerformanceMetrics(): PerformanceMetrics {
    const memoryInfo = (performance as any).memory;
    
    return {
      responseTime: this.calculateAverageResponseTime(),
      throughput: this.calculateThroughput(),
      errorRate: this.calculateErrorRate(),
      memoryUsage: memoryInfo ? (memoryInfo.usedJSHeapSize / memoryInfo.totalJSHeapSize) * 100 : 0,
      cpuUsage: 0, // Would need to be calculated differently
      activeConnections: this.getActiveConnectionsCount(),
      queueSize: 0, // Application-specific
      cacheHitRate: this.calculateCacheHitRate(),
    };
  }

  /**
   * Collect user analytics
   */
  private collectUserAnalytics(): UserAnalytics {
    return {
      activeUsers: this.getActiveUsersCount(),
      newUsers: this.getNewUsersCount(),
      sessionDuration: this.getAverageSessionDuration(),
      pageViews: this.getPageViewsCount(),
      bounceRate: this.calculateBounceRate(),
      conversionRate: this.calculateConversionRate(),
      featureUsage: this.getFeatureUsageStats(),
    };
  }

  /**
   * Collect business metrics
   */
  private collectBusinessMetrics(): BusinessMetrics {
    return {
      securityScansRun: this.getSecurityScansCount(),
      findingsGenerated: this.getFindingsCount(),
      costSavingsIdentified: this.getCostSavingsAmount(),
      accountsMonitored: this.getMonitoredAccountsCount(),
      alertsTriggered: this.getAlertsTriggeredCount(),
      userSatisfactionScore: this.getUserSatisfactionScore(),
    };
  }

  /**
   * Check performance thresholds
   */
  private checkPerformanceThresholds(metrics: PerformanceMetrics): void {
    const { alertThresholds } = this.config;

    if (metrics.responseTime > alertThresholds.responseTime) {
      this.triggerAlert('high_response_time', {
        current: metrics.responseTime,
        threshold: alertThresholds.responseTime,
      });
    }

    if (metrics.errorRate > alertThresholds.errorRate) {
      this.triggerAlert('high_error_rate', {
        current: metrics.errorRate,
        threshold: alertThresholds.errorRate,
      });
    }

    if (metrics.memoryUsage > alertThresholds.memoryUsage) {
      this.triggerAlert('high_memory_usage', {
        current: metrics.memoryUsage,
        threshold: alertThresholds.memoryUsage,
      });
    }
  }

  /**
   * Check alerts
   */
  private checkAlerts(event: MonitoringEvent): void {
    if (event.severity === 'critical') {
      this.triggerAlert('critical_event', {
        eventId: event.id,
        type: event.type,
        message: event.message,
      });
    }
  }

  /**
   * Trigger alert
   */
  private triggerAlert(alertType: string, metadata: Record<string, any>): void {
    const alertKey = `${alertType}:${JSON.stringify(metadata)}`;
    const lastAlert = this.alerts.get(alertKey);
    const now = new Date();

    // Prevent alert spam (minimum 5 minutes between same alerts)
    if (lastAlert && now.getTime() - lastAlert.getTime() < 300000) {
      return;
    }

    this.alerts.set(alertKey, now);

    this.recordEvent({
      type: MonitoringEventType.ALERT,
      severity: 'high',
      source: 'alert_system',
      message: `Alert triggered: ${alertType}`,
      metadata,
    });

    // Send to external alert systems
    this.sendExternalAlert(alertType, metadata);
  }

  /**
   * Send external alert
   */
  private sendExternalAlert(alertType: string, metadata: Record<string, any>): void {
    // Implementation would send to Slack, PagerDuty, etc.
    logger.warn('Alert triggered', { alertType, metadata });
  }

  /**
   * Process alerts
   */
  private processAlerts(): void {
    // Clean up old alerts
    const fiveMinutesAgo = new Date(Date.now() - 300000);
    
    for (const [key, timestamp] of this.alerts.entries()) {
      if (timestamp < fiveMinutesAgo) {
        this.alerts.delete(key);
      }
    }
  }

  /**
   * Cleanup old data
   */
  private cleanupOldData(): void {
    const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);

    this.events = this.events.filter(event => event.timestamp > cutoffDate);
    
    this.performanceBuffer = this.performanceBuffer.filter(
      (metrics: any) => new Date(metrics.timestamp) > cutoffDate
    );
    
    this.userAnalyticsBuffer = this.userAnalyticsBuffer.filter(
      (analytics: any) => new Date(analytics.timestamp) > cutoffDate
    );
    
    this.businessMetricsBuffer = this.businessMetricsBuffer.filter(
      (metrics: any) => new Date(metrics.timestamp) > cutoffDate
    );
  }

  /**
   * Emit event to real-time systems
   */
  private emitEvent(event: MonitoringEvent): void {
    // Implementation would emit to WebSocket, Server-Sent Events, etc.
    if (typeof window !== 'undefined' && 'CustomEvent' in window) {
      window.dispatchEvent(new CustomEvent('monitoring-event', { detail: event }));
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Helper methods (these would be implemented based on your specific metrics)
  private calculateAverageResponseTime(): number { return 0; }
  private calculateThroughput(): number { return 0; }
  private calculateErrorRate(): number { return 0; }
  private getActiveConnectionsCount(): number { return 0; }
  private calculateCacheHitRate(): number { return 0; }
  private getActiveUsersCount(): number { return 0; }
  private getNewUsersCount(): number { return 0; }
  private getAverageSessionDuration(): number { return 0; }
  private getPageViewsCount(): number { return 0; }
  private calculateBounceRate(): number { return 0; }
  private calculateConversionRate(): number { return 0; }
  private getFeatureUsageStats(): Record<string, number> { return {}; }
  private getSecurityScansCount(): number { return 0; }
  private getFindingsCount(): number { return 0; }
  private getCostSavingsAmount(): number { return 0; }
  private getMonitoredAccountsCount(): number { return 0; }
  private getAlertsTriggeredCount(): number { return 0; }
  private getUserSatisfactionScore(): number { return 0; }

  private getRecentPerformanceMetrics(): PerformanceMetrics {
    const recent = this.performanceBuffer.slice(-1)[0];
    return recent || this.collectPerformanceMetrics();
  }

  private getRecentUserAnalytics(): UserAnalytics {
    const recent = this.userAnalyticsBuffer.slice(-1)[0];
    return recent || this.collectUserAnalytics();
  }

  private getRecentBusinessMetrics(): BusinessMetrics {
    const recent = this.businessMetricsBuffer.slice(-1)[0];
    return recent || this.collectBusinessMetrics();
  }

  private getRecentEvents(limit: number): MonitoringEvent[] {
    return this.events.slice(-limit);
  }
}

// Global monitoring manager
export const monitoringManager = new AdvancedMonitoringManager();

// React hooks for monitoring
export const useMonitoring = () => {
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const updateStatus = async () => {
      try {
        const status = await monitoringManager.getSystemStatus();
        setSystemStatus(status);
      } catch (error) {
        logger.error('Failed to get system status', error as Error);
      } finally {
        setLoading(false);
      }
    };

    updateStatus();
    const interval = setInterval(updateStatus, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  return { systemStatus, loading };
};

// Monitoring event recorder hook
export const useMonitoringRecorder = () => {
  const recordEvent = useCallback((event: Omit<MonitoringEvent, 'id' | 'timestamp'>) => {
    monitoringManager.recordEvent(event);
  }, []);

  const recordPerformance = useCallback((metrics: PerformanceMetrics) => {
    monitoringManager.recordPerformanceMetrics(metrics);
  }, []);

  const recordUserAnalytics = useCallback((analytics: UserAnalytics) => {
    monitoringManager.recordUserAnalytics(analytics);
  }, []);

  const recordBusinessMetrics = useCallback((metrics: BusinessMetrics) => {
    monitoringManager.recordBusinessMetrics(metrics);
  }, []);

  return {
    recordEvent,
    recordPerformance,
    recordUserAnalytics,
    recordBusinessMetrics,
  };
};

// Initialize monitoring
monitoringManager;