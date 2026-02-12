/**
 * EVO Platform - Centralized Logger
 *
 * Design decisions:
 * - Uses console.log/error/warn → Lambda runtime sends to CloudWatch automatically
 * - Does NOT use CloudWatch SDK directly (unnecessary and adds latency)
 * - Structured JSON for easy Metric Filters and Logs Insights
 * - Consistent fields across ALL handlers
 */

// ============================================================================
// TYPES
// ============================================================================

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface LogContext {
  /** Handler name (e.g., 'run-sql', 'webauthn-authenticate') */
  handler?: string;
  /** AWS Request ID from Lambda context */
  requestId?: string;
  /** Correlation ID for request tracing across services */
  correlationId?: string;
  /** Authenticated user's Cognito sub */
  userId?: string;
  /** Organization ID (from token or impersonation) */
  organizationId?: string;
  /** HTTP method */
  method?: string;
  /** Request path */
  path?: string;
  /** Response status code */
  statusCode?: number;
  /** Request duration in ms */
  durationMs?: number;
  /** Source IP */
  sourceIp?: string;
  /** Additional metadata */
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  environment: string;
  functionName: string;
  functionVersion: string;
  region: string;
  handler?: string;
  requestId?: string;
  correlationId?: string;
  userId?: string;
  organizationId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  sourceIp?: string;
  errorName?: string;
  errorMessage?: string;
  errorStack?: string;
  meta?: Record<string, unknown>;
}

// ============================================================================
// LOGGER CLASS
// ============================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4,
};

export class EvoLogger {
  private service: string;
  private environment: string;
  private functionName: string;
  private functionVersion: string;
  private region: string;
  private minLevel: LogLevel;
  private persistentContext: Partial<LogContext> = {};

  constructor() {
    this.service = process.env.SERVICE_NAME || 'evo-platform';
    this.environment = process.env.NODE_ENV || 'production';
    this.functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'local';
    this.functionVersion = process.env.AWS_LAMBDA_FUNCTION_VERSION || '$LATEST';
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || 'INFO';
  }

  /** Set persistent context included in ALL subsequent logs. */
  setContext(context: Partial<LogContext>): void {
    this.persistentContext = { ...context };
  }

  /** Add keys to existing persistent context without overwriting. */
  appendContext(context: Partial<LogContext>): void {
    this.persistentContext = { ...this.persistentContext, ...context };
  }

  /** Clear persistent context. */
  clearContext(): void {
    this.persistentContext = {};
  }

  /** Initialize context from Lambda event + context objects. */
  initFromLambda(event: any, lambdaContext: any): void {
    const requestId = lambdaContext?.awsRequestId || 'unknown';
    const correlationId =
      event?.headers?.['x-correlation-id'] ||
      event?.headers?.['X-Correlation-ID'] ||
      requestId;

    this.setContext({
      requestId,
      correlationId,
      method: event?.requestContext?.http?.method || event?.httpMethod,
      path: event?.requestContext?.http?.path || event?.rawPath || event?.path,
      sourceIp:
        event?.requestContext?.http?.sourceIp ||
        event?.requestContext?.identity?.sourceIp,
    });
  }

  // --------------------------------------------------------------------------
  // Core log methods
  // --------------------------------------------------------------------------

  debug(message: string, meta?: Record<string, unknown>): void {
    this._log('DEBUG', message, undefined, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this._log('INFO', message, undefined, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this._log('WARN', message, undefined, meta);
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    this._log('ERROR', message, error, meta);
  }

  critical(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    this._log('CRITICAL', message, error, meta);
  }

  // --------------------------------------------------------------------------
  // Semantic log methods
  // --------------------------------------------------------------------------

  /** Log a completed HTTP request with status code and duration */
  httpResponse(statusCode: number, durationMs: number, meta?: Record<string, unknown>): void {
    const level: LogLevel = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';
    this._log(level, `HTTP ${statusCode}`, undefined, {
      statusCode,
      durationMs,
      errorType: statusCode >= 500 ? 'SERVER_ERROR' : statusCode >= 400 ? 'CLIENT_ERROR' : 'OK',
      ...meta,
    });
  }

  /** Log a security event */
  security(event: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', details?: Record<string, unknown>): void {
    const level: LogLevel = severity === 'CRITICAL' || severity === 'HIGH' ? 'ERROR' : 'WARN';
    this._log(level, `SECURITY: ${event}`, undefined, {
      type: 'security_event',
      securitySeverity: severity,
      securityEvent: event,
      ...details,
    });
  }

  /** Log an audit action */
  audit(action: string, details?: Record<string, unknown>): void {
    this._log('INFO', `AUDIT: ${action}`, undefined, {
      type: 'audit',
      action,
      ...details,
    });
  }

  /** Log a slow operation */
  slowOperation(operation: string, durationMs: number, thresholdMs: number): void {
    this._log('WARN', `SLOW_OPERATION: ${operation} took ${durationMs}ms (threshold: ${thresholdMs}ms)`, undefined, {
      type: 'slow_operation',
      operation,
      durationMs,
      thresholdMs,
    });
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private _log(level: LogLevel, message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      environment: this.environment,
      functionName: this.functionName,
      functionVersion: this.functionVersion,
      region: this.region,
      handler: this.persistentContext.handler as string | undefined,
      requestId: this.persistentContext.requestId as string | undefined,
      correlationId: this.persistentContext.correlationId as string | undefined,
      userId: this.persistentContext.userId as string | undefined,
      organizationId: this.persistentContext.organizationId as string | undefined,
      method: this.persistentContext.method as string | undefined,
      path: this.persistentContext.path as string | undefined,
      sourceIp: this.persistentContext.sourceIp as string | undefined,
    };

    if (meta?.statusCode !== undefined) entry.statusCode = meta.statusCode as number;
    if (meta?.durationMs !== undefined) entry.durationMs = meta.durationMs as number;

    if (error instanceof Error) {
      entry.errorName = error.name;
      entry.errorMessage = error.message;
      entry.errorStack = error.stack;
    } else if (error !== undefined && error !== null) {
      entry.errorMessage = String(error);
    }

    if (meta) {
      const { statusCode: _sc, durationMs: _dm, ...rest } = meta;
      if (Object.keys(rest).length > 0) {
        entry.meta = rest;
      }
    }

    const cleanEntry = Object.fromEntries(
      Object.entries(entry).filter(([_, v]) => v !== undefined && v !== null)
    );

    const json = JSON.stringify(cleanEntry);
    switch (level) {
      case 'DEBUG':
        console.debug(json);
        break;
      case 'INFO':
        console.info(json);
        break;
      case 'WARN':
        console.warn(json);
        break;
      case 'ERROR':
      case 'CRITICAL':
        console.error(json);
        break;
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const logger = new EvoLogger();
export default logger;
