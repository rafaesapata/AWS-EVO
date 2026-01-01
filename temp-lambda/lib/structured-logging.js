"use strict";
/**
 * Structured Logging System - Military Grade
 * Provides comprehensive logging with CloudWatch integration
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.StructuredLogger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
    LogLevel["CRITICAL"] = "CRITICAL";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
/**
 * Structured Logger for military-grade security
 */
class StructuredLogger {
    constructor() {
        this.cloudWatchClient = null;
        this.metricsClient = null;
        this.initialized = false;
        this.logGroupName = process.env.LOG_GROUP_NAME || '/aws/lambda/evo-platform';
        this.logStreamName = this.generateLogStreamName();
        this.projectName = process.env.PROJECT_NAME || 'evo-uds';
        this.environment = process.env.NODE_ENV || 'development';
    }
    /**
     * Initialize AWS SDK clients lazily
     */
    async initializeClients() {
        if (this.initialized)
            return;
        const region = process.env.AWS_REGION || 'us-east-1';
        try {
            const { CloudWatchClient, PutMetricDataCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-cloudwatch')));
            this.metricsClient = new CloudWatchClient({ region });
            this.PutMetricDataCommand = PutMetricDataCommand;
        }
        catch {
            // CloudWatch SDK not available
        }
        try {
            const { CloudWatchLogsClient, PutLogEventsCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-cloudwatch-logs')));
            this.cloudWatchClient = new CloudWatchLogsClient({ region });
            this.PutLogEventsCommand = PutLogEventsCommand;
        }
        catch {
            // CloudWatch Logs SDK not available
        }
        this.initialized = true;
    }
    generateLogStreamName() {
        const date = new Date().toISOString().split('T')[0];
        const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'local';
        const instanceId = process.env.AWS_LAMBDA_LOG_STREAM_NAME?.split('/').pop() || 'default';
        return `${date}/${functionName}/${instanceId}`;
    }
    /**
     * Generic log with context
     */
    async log(level, message, context = {}, error) {
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
     * Convenience method for INFO level logs
     */
    info(message, context = {}) {
        this.log(LogLevel.INFO, message, context);
    }
    /**
     * Convenience method for WARN level logs
     */
    warn(message, context = {}) {
        this.log(LogLevel.WARN, message, context);
    }
    /**
     * Convenience method for ERROR level logs
     */
    error(message, context = {}, err) {
        this.log(LogLevel.ERROR, message, context, err);
    }
    /**
     * Convenience method for DEBUG level logs
     */
    debug(message, context = {}) {
        this.log(LogLevel.DEBUG, message, context);
    }
    /**
     * Convenience method for CRITICAL level logs
     */
    critical(message, context = {}, err) {
        this.log(LogLevel.CRITICAL, message, context, err);
    }
    /**
     * Log security event
     */
    async logSecurityEvent(eventType, severity, details, context) {
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
    async publishSecurityMetric(eventType, severity) {
        await this.initializeClients();
        const PutMetricDataCommand = this.PutMetricDataCommand;
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
        }
        catch (error) {
            console.error('Failed to publish security metric:', error);
        }
    }
    /**
     * Log tenant isolation violation
     */
    async logTenantViolation(context, violation) {
        await this.logSecurityEvent('TENANT_ISOLATION_VIOLATION', 'CRITICAL', violation, context);
        await this.initializeClients();
        const PutMetricDataCommand = this.PutMetricDataCommand;
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
            }
            catch (error) {
                console.error('Failed to publish tenant violation metric:', error);
            }
        }
        else {
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
    async logAuthEvent(eventType, context, details) {
        const severity = eventType === 'LOGIN_FAILURE' ? 'MEDIUM' : 'LOW';
        await this.logSecurityEvent(eventType, severity, details || {}, context);
        if (eventType === 'LOGIN_FAILURE') {
            await this.initializeClients();
            const PutMetricDataCommand = this.PutMetricDataCommand;
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
                }
                catch (error) {
                    console.error('Failed to publish auth failure metric:', error);
                }
            }
            else {
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
    async logRateLimitEvent(identifier, context) {
        await this.logSecurityEvent('RATE_LIMIT_EXCEEDED', 'MEDIUM', { identifier }, context);
        await this.initializeClients();
        const PutMetricDataCommand = this.PutMetricDataCommand;
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
            }
            catch (error) {
                console.error('Failed to publish rate limit metric:', error);
            }
        }
        else {
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
    async logInjectionAttempt(type, payload, context) {
        await this.logSecurityEvent(type, 'HIGH', {
            payload: payload.substring(0, 200), // Truncate for safety
            detected: true
        }, context);
        const metricName = type === 'SQL_INJECTION' ? 'SQLInjectionAttempts' : 'XSSAttempts';
        await this.initializeClients();
        const PutMetricDataCommand = this.PutMetricDataCommand;
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
            }
            catch (error) {
                console.error('Failed to publish injection attempt metric:', error);
            }
        }
        else {
            console.log(JSON.stringify({
                level: 'METRIC',
                metricName,
                value: 1
            }));
        }
    }
    async sendToCloudWatch(logEntry) {
        await this.initializeClients();
        const PutLogEventsCommand = this.PutLogEventsCommand;
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
        }
        catch (error) {
            if (error.name === 'InvalidSequenceTokenException') {
                this.sequenceToken = error.expectedSequenceToken;
                await this.sendToCloudWatch(logEntry);
            }
            else {
                console.error('Failed to send log to CloudWatch:', error);
            }
        }
    }
}
exports.StructuredLogger = StructuredLogger;
// Singleton export
exports.logger = new StructuredLogger();
//# sourceMappingURL=structured-logging.js.map