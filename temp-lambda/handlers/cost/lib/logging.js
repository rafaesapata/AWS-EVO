"use strict";
/**
 * Production-ready logging system for EVO UDS Backend
 * Supports multiple log levels, structured logging, and AWS CloudWatch integration
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
exports.logger = exports.LogLevel = void 0;
exports.withLogging = withLogging;
exports.withRequestId = withRequestId;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
const currentLevel = process.env.LOG_LEVEL
    ? LogLevel[process.env.LOG_LEVEL]
    : LogLevel.INFO;
const isProduction = process.env.NODE_ENV === 'production';
function formatMessage(level, message, meta) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        ...(meta && { meta }),
    };
    // In production, use structured JSON logging for CloudWatch
    if (isProduction) {
        return JSON.stringify(logEntry);
    }
    // In development, use human-readable format
    const metaStr = meta ? ` ${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${level}] ${message}${metaStr}`;
}
function shouldLog(level) {
    return currentLevel <= level;
}
exports.logger = {
    debug(message, meta) {
        if (shouldLog(LogLevel.DEBUG)) {
            console.debug(formatMessage('DEBUG', message, meta));
        }
    },
    info(message, meta) {
        if (shouldLog(LogLevel.INFO)) {
            console.info(formatMessage('INFO', message, meta));
        }
    },
    warn(message, meta) {
        if (shouldLog(LogLevel.WARN)) {
            console.warn(formatMessage('WARN', message, meta));
        }
    },
    error(message, error, meta) {
        if (shouldLog(LogLevel.ERROR)) {
            let errorMeta = meta || {};
            if (error instanceof Error) {
                errorMeta = {
                    ...errorMeta,
                    error: {
                        name: error.name,
                        message: error.message,
                        stack: error.stack,
                    },
                };
            }
            else if (error) {
                errorMeta = {
                    ...errorMeta,
                    error: String(error),
                };
            }
            console.error(formatMessage('ERROR', message, errorMeta));
        }
    },
    // Structured logging methods for specific use cases
    audit(action, userId, organizationId, details) {
        this.info(`AUDIT: ${action}`, {
            type: 'audit',
            userId,
            organizationId,
            action,
            ...details,
        });
    },
    security(event, details) {
        this.warn(`SECURITY: ${event}`, {
            type: 'security',
            event,
            ...details,
        });
    },
    performance(operation, duration, meta) {
        this.info(`PERFORMANCE: ${operation} completed in ${duration}ms`, {
            type: 'performance',
            operation,
            duration,
            ...meta,
        });
    },
    // Lambda-specific logging
    lambda: {
        start(functionName, requestId, event) {
            exports.logger.info(`Lambda function started: ${functionName}`, {
                type: 'lambda',
                functionName,
                requestId,
                eventType: event?.httpMethod || event?.Records?.[0]?.eventName || 'unknown',
            });
        },
        end(functionName, requestId, duration, statusCode) {
            exports.logger.info(`Lambda function completed: ${functionName}`, {
                type: 'lambda',
                functionName,
                requestId,
                duration,
                statusCode,
            });
        },
        error(functionName, requestId, error) {
            exports.logger.error(`Lambda function failed: ${functionName}`, error, {
                type: 'lambda',
                functionName,
                requestId,
            });
        },
    },
    // Database logging
    database: {
        query(query, duration, params) {
            exports.logger.debug('Database query executed', {
                type: 'database',
                query: query.substring(0, 200), // Truncate long queries
                duration,
                paramCount: params?.length || 0,
            });
        },
        error(query, error, params) {
            exports.logger.error('Database query failed', error, {
                type: 'database',
                query: query.substring(0, 200),
                paramCount: params?.length || 0,
            });
        },
        migration(name, direction, duration) {
            exports.logger.info(`Database migration ${direction}: ${name}`, {
                type: 'migration',
                name,
                direction,
                duration,
            });
        },
    },
    // HTTP request logging
    http: {
        request(method, url, statusCode, duration, userId) {
            exports.logger.info(`${method} ${url} ${statusCode}`, {
                type: 'http',
                method,
                url,
                statusCode,
                duration,
                userId,
            });
        },
        error(method, url, error, userId) {
            exports.logger.error(`${method} ${url} failed`, error, {
                type: 'http',
                method,
                url,
                userId,
            });
        },
    },
};
// Export a middleware function for Lambda functions
function withLogging(functionName, handler) {
    return (async (...args) => {
        const startTime = Date.now();
        const requestId = args[1]?.awsRequestId || 'unknown';
        exports.logger.lambda.start(functionName, requestId, args[0]);
        try {
            const result = await handler(...args);
            const duration = Date.now() - startTime;
            exports.logger.lambda.end(functionName, requestId, duration, result?.statusCode);
            return result;
        }
        catch (error) {
            exports.logger.lambda.error(functionName, requestId, error);
            throw error;
        }
    });
}
/**
 * Middleware for request ID tracking
 * Extracts request ID from headers or generates one, and includes it in response
 */
function withRequestId(handler) {
    return (async (event, context) => {
        // Extract or generate request ID
        const requestId = event?.headers?.['x-request-id'] ||
            event?.headers?.['X-Request-ID'] ||
            context?.awsRequestId ||
            `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const correlationId = event?.headers?.['x-correlation-id'] ||
            event?.headers?.['X-Correlation-ID'] ||
            requestId;
        // Set context for logging
        exports.logger.info('Request started', {
            requestId,
            correlationId,
            method: event?.requestContext?.http?.method || event?.httpMethod,
            path: event?.requestContext?.http?.path || event?.path,
        });
        // Import and set request context for response headers
        const { setRequestContext } = await Promise.resolve().then(() => __importStar(require('./response.js')));
        setRequestContext(requestId, correlationId);
        const startTime = Date.now();
        try {
            const result = await handler(event, context);
            const duration = Date.now() - startTime;
            exports.logger.info('Request completed', {
                requestId,
                correlationId,
                duration,
                statusCode: result?.statusCode,
            });
            // Ensure request ID is in response headers
            return {
                ...result,
                headers: {
                    ...result?.headers,
                    'X-Request-ID': requestId,
                    'X-Correlation-ID': correlationId,
                    'X-Response-Time': `${duration}ms`,
                },
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            exports.logger.error('Request failed', error, {
                requestId,
                correlationId,
                duration,
            });
            throw error;
        }
    });
}
// Export default logger instance
exports.default = exports.logger;
//# sourceMappingURL=logging.js.map