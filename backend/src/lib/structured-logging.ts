/**
 * Structured Logging System - Military Grade
 * Provides comprehensive logging with CloudWatch integration
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export interface LogContext {
  organizationId?: string;
  userId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  traceId?: string;
  [key: string]: any;
}

export interface SecurityEventDetails {
  eventType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: Record<string, any>;
  patterns?: string[];
}

/**
 * Structured Logger for military-grade security
 */
export class StructuredLogger {
  private cloudWatchClient: any = null;
  private metricsClient: any = null;
  private logGroupName: string;
  private logStreamName: string;
  private sequenceToken?: string;
  private projectName: string;
  private environment: string;
  private initialized: boolean = false;

  constructor() {
    this.logGroupName = process.env.LOG_GROUP_NAME || '/aws/lambda/evo-platform';
    this.logStreamName = this.generateLogStreamName();
    this.projectName = process.env.PROJECT_NAME || 'evo-uds';
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Initialize AWS SDK clients lazily
   */
  private async initializeClients(): Promise<void> {
    if (this.initialized) return;
    
    const region = process.env.AWS_REGION || 'us-east-1';
    
    try {
      const { CloudWatchClient, PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch');
      this.metricsClient = new CloudWatchClient({ region });
      (this as any).PutMetricDataCommand = PutMetricDataCommand;
    } catch {
      // CloudWatch SDK not available
    }

    try {
      const { CloudWatchLogsClient, PutLogEventsCommand } = await import('@aws-sdk/client-cloudwatch-logs');
      this.cloudWatchClient = new CloudWatchLogsClient({ region });
      (this as any).PutLogEventsCommand = PutLogEventsCommand;
    } catch {
      // CloudWatch Logs SDK not available
    }

    this.initialized = true;
  }

  private generateLogStreamName(): string {
    const date = new Date().toISOString().split('T')[0];
    const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'local';
    const instanceId = process.env.AWS_LAMBDA_LOG_STREAM_NAME?.split('/').pop() || 'default';
    return `${date}/${functionName}/${instanceId}`;
  }

  /**
   * Generic log with context
   */
  async log(
    level: LogLevel,
    message: string,
    context: LogContext = {},
    error?: Error
  ): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...context,
        environment: this.environment,
        region: process.env.AWS_REGION
      },
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: this.environment === 'development' ? error.stack : undefined
        }
      })
    };

    // Console for Lambda CloudWatch standard
    const logMethod = level === LogLevel.ERROR || level === LogLevel.CRITICAL
      ? console.error
      : console.log;

    logMethod(JSON.stringify(logEntry));

    // CloudWatch custom log group for production
    if (this.environment === 'production' && process.env.CUSTOM_LOG_GROUP) {
      await this.sendToCloudWatch(logEntry);
    }
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    eventType: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    details: Record<string, any>,
    context: LogContext
  ): Promise<void> {
    const level = severity === 'CRITICAL' || severity === 'HIGH'
      ? LogLevel.CRITICAL
      : LogLevel.ERROR;

    await this.log(level, `Security Event: ${eventType}`, {
      ...context,
      security: {
        eventType,
        severity,
        details,
        timestamp: new Date().toISOString()
      }
    });

    // Custom metrics for CloudWatch
    await this.publishSecurityMetric(eventType, severity);
  }

  /**
   * Publish security metric
   */
  async publishSecurityMetric(
    eventType: string,
    severity: string
  ): Promise<void> {
    await this.initializeClients();
    
    const PutMetricDataCommand = (this as any).PutMetricDataCommand;
    
    if (!this.metricsClient || !PutMetricDataCommand) {
      console.log(JSON.stringify({
        level: 'METRIC',
        metricName: 'SecurityEvents',
        eventType,
        severity,
        value: 1
      }));
      return;
    }

    try {
      await this.metricsClient.send(new PutMetricDataCommand({
        Namespace: `${this.projectName}/${this.environment}`,
        MetricData: [
          {
            MetricName: 'SecurityEvents',
            Dimensions: [
              { Name: 'EventType', Value: eventType },
              { Name: 'Severity', Value: severity }
            ],
            Value: 1,
            Unit: 'Count'
          }
        ]
      }));
    } catch (error) {
      console.error('Failed to publish security metric:', error);
    }
  }

  /**
   * Log tenant isolation violation
   */
  async logTenantViolation(
    context: LogContext,
    violation: {
      type: string;
      resource: string;
      attemptedAccess: string;
      targetOrgId?: string;
    }
  ): Promise<void> {
    await this.logSecurityEvent(
      'TENANT_ISOLATION_VIOLATION',
      'CRITICAL',
      violation,
      context
    );

    await this.initializeClients();
    const PutMetricDataCommand = (this as any).PutMetricDataCommand;

    // Publish specific metric
    if (this.metricsClient && PutMetricDataCommand) {
      try {
        await this.metricsClient.send(new PutMetricDataCommand({
          Namespace: `${this.projectName}/${this.environment}`,
          MetricData: [
            {
              MetricName: 'TenantIsolationViolations',
              Value: 1,
              Unit: 'Count'
            }
          ]
        }));
      } catch (error) {
        console.error('Failed to publish tenant violation metric:', error);
      }
    } else {
      console.log(JSON.stringify({
        level: 'METRIC',
        metricName: 'TenantIsolationViolations',
        value: 1
      }));
    }
  }

  /**
   * Log authentication event
   */
  async logAuthEvent(
    eventType: 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGOUT' | 'TOKEN_REFRESH' | 'MFA_REQUIRED',
    context: LogContext,
    details?: Record<string, any>
  ): Promise<void> {
    const severity = eventType === 'LOGIN_FAILURE' ? 'MEDIUM' : 'LOW';
    await this.logSecurityEvent(eventType, severity, details || {}, context);

    if (eventType === 'LOGIN_FAILURE') {
      await this.initializeClients();
      const PutMetricDataCommand = (this as any).PutMetricDataCommand;
      
      if (this.metricsClient && PutMetricDataCommand) {
        try {
          await this.metricsClient.send(new PutMetricDataCommand({
            Namespace: `${this.projectName}/${this.environment}`,
            MetricData: [
              {
                MetricName: 'AuthenticationFailures',
                Value: 1,
                Unit: 'Count'
              }
            ]
          }));
        } catch (error) {
          console.error('Failed to publish auth failure metric:', error);
        }
      } else {
        console.log(JSON.stringify({
          level: 'METRIC',
          metricName: 'AuthenticationFailures',
          value: 1
        }));
      }
    }
  }

  /**
   * Log rate limit event
   */
  async logRateLimitEvent(
    identifier: string,
    context: LogContext
  ): Promise<void> {
    await this.logSecurityEvent(
      'RATE_LIMIT_EXCEEDED',
      'MEDIUM',
      { identifier },
      context
    );

    await this.initializeClients();
    const PutMetricDataCommand = (this as any).PutMetricDataCommand;

    if (this.metricsClient && PutMetricDataCommand) {
      try {
        await this.metricsClient.send(new PutMetricDataCommand({
          Namespace: `${this.projectName}/${this.environment}`,
          MetricData: [
            {
              MetricName: 'RateLimitExceeded',
              Value: 1,
              Unit: 'Count'
            }
          ]
        }));
      } catch (error) {
        console.error('Failed to publish rate limit metric:', error);
      }
    } else {
      console.log(JSON.stringify({
        level: 'METRIC',
        metricName: 'RateLimitExceeded',
        value: 1
      }));
    }
  }

  /**
   * Log injection attempt
   */
  async logInjectionAttempt(
    type: 'SQL_INJECTION' | 'XSS' | 'COMMAND_INJECTION',
    payload: string,
    context: LogContext
  ): Promise<void> {
    await this.logSecurityEvent(
      type,
      'HIGH',
      { 
        payload: payload.substring(0, 200), // Truncate for safety
        detected: true 
      },
      context
    );

    const metricName = type === 'SQL_INJECTION' ? 'SQLInjectionAttempts' : 'XSSAttempts';
    
    await this.initializeClients();
    const PutMetricDataCommand = (this as any).PutMetricDataCommand;
    
    if (this.metricsClient && PutMetricDataCommand) {
      try {
        await this.metricsClient.send(new PutMetricDataCommand({
          Namespace: `${this.projectName}/${this.environment}`,
          MetricData: [
            {
              MetricName: metricName,
              Value: 1,
              Unit: 'Count'
            }
          ]
        }));
      } catch (error) {
        console.error('Failed to publish injection attempt metric:', error);
      }
    } else {
      console.log(JSON.stringify({
        level: 'METRIC',
        metricName,
        value: 1
      }));
    }
  }

  private async sendToCloudWatch(logEntry: any): Promise<void> {
    await this.initializeClients();
    const PutLogEventsCommand = (this as any).PutLogEventsCommand;
    
    if (!this.cloudWatchClient || !PutLogEventsCommand) {
      return;
    }

    try {
      await this.cloudWatchClient.send(new PutLogEventsCommand({
        logGroupName: this.logGroupName,
        logStreamName: this.logStreamName,
        logEvents: [{
          timestamp: Date.now(),
          message: JSON.stringify(logEntry)
        }],
        sequenceToken: this.sequenceToken
      }));
    } catch (error: any) {
      if (error.name === 'InvalidSequenceTokenException') {
        this.sequenceToken = error.expectedSequenceToken;
        await this.sendToCloudWatch(logEntry);
      } else {
        console.error('Failed to send log to CloudWatch:', error);
      }
    }
  }
}

// Singleton export
export const logger = new StructuredLogger();
