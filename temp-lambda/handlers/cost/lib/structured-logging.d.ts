/**
 * Structured Logging System - Military Grade
 * Provides comprehensive logging with CloudWatch integration
 */
export declare enum LogLevel {
    DEBUG = "DEBUG",
    INFO = "INFO",
    WARN = "WARN",
    ERROR = "ERROR",
    CRITICAL = "CRITICAL"
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
export declare class StructuredLogger {
    private cloudWatchClient;
    private metricsClient;
    private logGroupName;
    private logStreamName;
    private sequenceToken?;
    private projectName;
    private environment;
    private initialized;
    constructor();
    /**
     * Initialize AWS SDK clients lazily
     */
    private initializeClients;
    private generateLogStreamName;
    /**
     * Generic log with context
     */
    log(level: LogLevel, message: string, context?: LogContext, error?: Error): Promise<void>;
    /**
     * Convenience method for INFO level logs
     */
    info(message: string, context?: LogContext): void;
    /**
     * Convenience method for WARN level logs
     */
    warn(message: string, context?: LogContext): void;
    /**
     * Convenience method for ERROR level logs
     */
    error(message: string, context?: LogContext, err?: Error): void;
    /**
     * Convenience method for DEBUG level logs
     */
    debug(message: string, context?: LogContext): void;
    /**
     * Convenience method for CRITICAL level logs
     */
    critical(message: string, context?: LogContext, err?: Error): void;
    /**
     * Log security event
     */
    logSecurityEvent(eventType: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', details: Record<string, any>, context: LogContext): Promise<void>;
    /**
     * Publish security metric
     */
    publishSecurityMetric(eventType: string, severity: string): Promise<void>;
    /**
     * Log tenant isolation violation
     */
    logTenantViolation(context: LogContext, violation: {
        type: string;
        resource: string;
        attemptedAccess: string;
        targetOrgId?: string;
    }): Promise<void>;
    /**
     * Log authentication event
     */
    logAuthEvent(eventType: 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGOUT' | 'TOKEN_REFRESH' | 'MFA_REQUIRED', context: LogContext, details?: Record<string, any>): Promise<void>;
    /**
     * Log rate limit event
     */
    logRateLimitEvent(identifier: string, context: LogContext): Promise<void>;
    /**
     * Log injection attempt
     */
    logInjectionAttempt(type: 'SQL_INJECTION' | 'XSS' | 'COMMAND_INJECTION', payload: string, context: LogContext): Promise<void>;
    private sendToCloudWatch;
}
export declare const logger: StructuredLogger;
//# sourceMappingURL=structured-logging.d.ts.map