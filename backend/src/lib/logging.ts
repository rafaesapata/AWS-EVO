/**
 * Production-ready logging system for EVO Platform Backend
 * Supports multiple log levels, structured logging, and AWS CloudWatch integration
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  meta?: Record<string, any>;
  requestId?: string;
  userId?: string;
  organizationId?: string;
}

const currentLevel = process.env.LOG_LEVEL 
  ? LogLevel[process.env.LOG_LEVEL as keyof typeof LogLevel] 
  : LogLevel.INFO;

const isProduction = process.env.NODE_ENV === 'production';

function formatMessage(level: string, message: string, meta?: Record<string, any>): string {
  const timestamp = new Date().toISOString();
  
  const logEntry: LogEntry = {
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

function shouldLog(level: LogLevel): boolean {
  return currentLevel <= level;
}

export const logger = {
  debug(message: string, meta?: Record<string, any>) {
    if (shouldLog(LogLevel.DEBUG)) {
      console.debug(formatMessage('DEBUG', message, meta));
    }
  },

  info(message: string, meta?: Record<string, any>) {
    if (shouldLog(LogLevel.INFO)) {
      console.info(formatMessage('INFO', message, meta));
    }
  },

  warn(message: string, meta?: Record<string, any>) {
    if (shouldLog(LogLevel.WARN)) {
      console.warn(formatMessage('WARN', message, meta));
    }
  },

  error(message: string, error?: Error | unknown, meta?: Record<string, any>) {
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
      } else if (error) {
        errorMeta = {
          ...errorMeta,
          error: String(error),
        };
      }

      console.error(formatMessage('ERROR', message, errorMeta));
    }
  },

  // Structured logging methods for specific use cases
  audit(action: string, userId: string, organizationId: string, details?: Record<string, any>) {
    this.info(`AUDIT: ${action}`, {
      type: 'audit',
      userId,
      organizationId,
      action,
      ...details,
    });
  },

  security(event: string, details: Record<string, any>) {
    this.warn(`SECURITY: ${event}`, {
      type: 'security',
      event,
      ...details,
    });
  },

  performance(operation: string, duration: number, meta?: Record<string, any>) {
    this.info(`PERFORMANCE: ${operation} completed in ${duration}ms`, {
      type: 'performance',
      operation,
      duration,
      ...meta,
    });
  },

  // Lambda-specific logging
  lambda: {
    start(functionName: string, requestId: string, event?: any) {
      logger.info(`Lambda function started: ${functionName}`, {
        type: 'lambda',
        functionName,
        requestId,
        eventType: event?.httpMethod || event?.Records?.[0]?.eventName || 'unknown',
      });
    },

    end(functionName: string, requestId: string, duration: number, statusCode?: number) {
      logger.info(`Lambda function completed: ${functionName}`, {
        type: 'lambda',
        functionName,
        requestId,
        duration,
        statusCode,
      });
    },

    error(functionName: string, requestId: string, error: Error) {
      logger.error(`Lambda function failed: ${functionName}`, error, {
        type: 'lambda',
        functionName,
        requestId,
      });
    },
  },

  // Database logging
  database: {
    query(query: string, duration: number, params?: any[]) {
      logger.debug('Database query executed', {
        type: 'database',
        query: query.substring(0, 200), // Truncate long queries
        duration,
        paramCount: params?.length || 0,
      });
    },

    error(query: string, error: Error, params?: any[]) {
      logger.error('Database query failed', error, {
        type: 'database',
        query: query.substring(0, 200),
        paramCount: params?.length || 0,
      });
    },

    migration(name: string, direction: 'up' | 'down', duration?: number) {
      logger.info(`Database migration ${direction}: ${name}`, {
        type: 'migration',
        name,
        direction,
        duration,
      });
    },
  },

  // HTTP request logging
  http: {
    request(method: string, url: string, statusCode: number, duration: number, userId?: string) {
      logger.info(`${method} ${url} ${statusCode}`, {
        type: 'http',
        method,
        url,
        statusCode,
        duration,
        userId,
      });
    },

    error(method: string, url: string, error: Error, userId?: string) {
      logger.error(`${method} ${url} failed`, error, {
        type: 'http',
        method,
        url,
        userId,
      });
    },
  },
};

// Export a middleware function for Lambda functions
export function withLogging<T extends (...args: any[]) => any>(
  functionName: string,
  handler: T
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    const requestId = args[1]?.awsRequestId || 'unknown';
    
    logger.lambda.start(functionName, requestId, args[0]);
    
    try {
      const result = await handler(...args);
      const duration = Date.now() - startTime;
      
      logger.lambda.end(functionName, requestId, duration, result?.statusCode);
      
      return result;
    } catch (error) {
      logger.lambda.error(functionName, requestId, error as Error);
      throw error;
    }
  }) as T;
}

/**
 * Middleware for request ID tracking
 * Extracts request ID from headers or generates one, and includes it in response
 */
export function withRequestId<T extends (...args: any[]) => any>(
  handler: T
): T {
  return (async (event: any, context: any) => {
    // Extract or generate request ID
    const requestId = event?.headers?.['x-request-id'] || 
                      event?.headers?.['X-Request-ID'] || 
                      context?.awsRequestId || 
                      `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const correlationId = event?.headers?.['x-correlation-id'] || 
                          event?.headers?.['X-Correlation-ID'] || 
                          requestId;
    
    // Set context for logging
    logger.info('Request started', {
      requestId,
      correlationId,
      method: event?.requestContext?.http?.method || event?.httpMethod,
      path: event?.requestContext?.http?.path || event?.path,
    });
    
    // Import and set request context for response headers
    const { clearRequestContext, setRequestContext } = await import('./response.js');
    clearRequestContext();
    setRequestContext(requestId, correlationId);
    
    const startTime = Date.now();
    
    try {
      const result = await handler(event, context);
      const duration = Date.now() - startTime;
      
      logger.info('Request completed', {
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
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Request failed', error as Error, {
        requestId,
        correlationId,
        duration,
      });
      
      throw error;
    }
  }) as T;
}

// Export default logger instance
export default logger;