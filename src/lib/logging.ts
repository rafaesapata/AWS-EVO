/**
 * Comprehensive Logging System
 * Provides structured logging with multiple levels and outputs
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4,
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  component?: string;
  userId?: string;
  organizationId?: string;
  sessionId?: string;
  requestId?: string;
  stack?: string;
  tags?: string[];
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableStorage: boolean;
  enableRemote: boolean;
  maxStorageEntries: number;
  remoteEndpoint?: string;
  component?: string;
  userId?: string;
  organizationId?: string;
  sessionId?: string;
}

/**
 * Advanced Logger Class
 */
export class Logger {
  private config: LoggerConfig;
  private buffer: LogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      enableConsole: process.env.NODE_ENV === 'development',
      enableStorage: true,
      enableRemote: process.env.NODE_ENV === 'production',
      maxStorageEntries: 1000,
      ...config,
    };

    // Generate session ID if not provided
    if (!this.config.sessionId) {
      this.config.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Setup periodic flush for remote logging
    if (this.config.enableRemote) {
      this.flushTimer = setInterval(() => this.flushBuffer(), 30000); // 30 seconds
    }

    // Cleanup on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flushBuffer());
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    stack?: string,
    tags?: string[]
  ): LogEntry {
    return {
      timestamp: new Date(),
      level,
      message,
      context,
      component: this.config.component,
      userId: this.config.userId,
      organizationId: this.config.organizationId,
      sessionId: this.config.sessionId,
      requestId: this.generateRequestId(),
      stack,
      tags,
    };
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = LogLevel[entry.level];
    const component = entry.component ? `[${entry.component}]` : '';
    const context = entry.context ? JSON.stringify(entry.context) : '';
    
    return `${timestamp} ${level} ${component} ${entry.message} ${context}`.trim();
  }

  private logToConsole(entry: LogEntry): void {
    if (!this.config.enableConsole) return;

    const message = this.formatMessage(entry);
    const style = this.getConsoleStyle(entry.level);

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(`%c${message}`, style, entry.context);
        break;
      case LogLevel.INFO:
        console.info(`%c${message}`, style, entry.context);
        break;
      case LogLevel.WARN:
        console.warn(`%c${message}`, style, entry.context);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(`%c${message}`, style, entry.context);
        if (entry.stack) {
          console.error(entry.stack);
        }
        break;
    }
  }

  private getConsoleStyle(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return 'color: #6b7280; font-size: 12px;';
      case LogLevel.INFO:
        return 'color: #3b82f6; font-weight: normal;';
      case LogLevel.WARN:
        return 'color: #f59e0b; font-weight: bold;';
      case LogLevel.ERROR:
        return 'color: #ef4444; font-weight: bold;';
      case LogLevel.CRITICAL:
        return 'color: #dc2626; font-weight: bold; background: #fef2f2; padding: 2px 4px;';
      default:
        return '';
    }
  }

  private logToStorage(entry: LogEntry): void {
    if (!this.config.enableStorage || typeof window === 'undefined') return;

    try {
      const storageKey = 'evo_logs';
      const existingLogs = JSON.parse(localStorage.getItem(storageKey) || '[]');
      
      existingLogs.unshift(entry);
      
      // Keep only the most recent entries
      if (existingLogs.length > this.config.maxStorageEntries) {
        existingLogs.splice(this.config.maxStorageEntries);
      }
      
      localStorage.setItem(storageKey, JSON.stringify(existingLogs));
    } catch (error) {
      console.warn('Failed to store log entry:', error);
    }
  }

  private logToRemote(entry: LogEntry): void {
    if (!this.config.enableRemote || !this.config.remoteEndpoint) return;

    this.buffer.push(entry);

    // Flush immediately for critical errors
    if (entry.level === LogLevel.CRITICAL) {
      this.flushBuffer();
    }
  }

  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0 || !this.config.remoteEndpoint) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entries,
          metadata: {
            userAgent: navigator.userAgent,
            url: window.location.href,
            timestamp: new Date().toISOString(),
          },
        }),
      });
    } catch (error) {
      console.warn('Failed to send logs to remote endpoint:', error);
      // Put entries back in buffer for retry
      this.buffer.unshift(...entries);
    }
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    stack?: string,
    tags?: string[]
  ): void {
    if (!this.shouldLog(level)) return;

    const entry = this.createLogEntry(level, message, context, stack, tags);

    this.logToConsole(entry);
    this.logToStorage(entry);
    this.logToRemote(entry);
  }

  debug(message: string, context?: Record<string, unknown>, tags?: string[]): void {
    this.log(LogLevel.DEBUG, message, context, undefined, tags);
  }

  info(message: string, context?: Record<string, unknown>, tags?: string[]): void {
    this.log(LogLevel.INFO, message, context, undefined, tags);
  }

  warn(message: string, context?: Record<string, unknown>, tags?: string[]): void {
    this.log(LogLevel.WARN, message, context, undefined, tags);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>, tags?: string[]): void {
    this.log(LogLevel.ERROR, message, { ...context, error: error?.message }, error?.stack, tags);
  }

  critical(message: string, error?: Error, context?: Record<string, unknown>, tags?: string[]): void {
    this.log(LogLevel.CRITICAL, message, { ...context, error: error?.message }, error?.stack, tags);
  }

  // Specialized logging methods
  performance(operation: string, duration: number, context?: Record<string, unknown>): void {
    this.info(`Performance: ${operation}`, {
      ...context,
      duration,
      type: 'performance',
    }, ['performance']);
  }

  security(event: string, context?: Record<string, unknown>): void {
    this.warn(`Security: ${event}`, {
      ...context,
      type: 'security',
    }, ['security']);
  }

  audit(action: string, context?: Record<string, unknown>): void {
    this.info(`Audit: ${action}`, {
      ...context,
      type: 'audit',
    }, ['audit']);
  }

  business(event: string, context?: Record<string, unknown>): void {
    this.info(`Business: ${event}`, {
      ...context,
      type: 'business',
    }, ['business']);
  }

  // Configuration methods
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  setComponent(component: string): void {
    this.config.component = component;
  }

  setUser(userId: string, organizationId?: string): void {
    this.config.userId = userId;
    this.config.organizationId = organizationId;
  }

  // Utility methods
  getStoredLogs(): LogEntry[] {
    if (typeof window === 'undefined') return [];

    try {
      return JSON.parse(localStorage.getItem('evo_logs') || '[]');
    } catch {
      return [];
    }
  }

  clearStoredLogs(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('evo_logs');
  }

  exportLogs(): string {
    const logs = this.getStoredLogs();
    return logs.map(entry => this.formatMessage(entry)).join('\n');
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushBuffer();
  }
}

// Global logger instance
export const logger = new Logger({
  component: 'EVO-UDS',
  level: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
});

/**
 * React hook for component-specific logging
 */
export function useLogger(component: string) {
  const componentLogger = new Logger({
    ...logger.config,
    component,
  });

  return componentLogger;
}

/**
 * Performance measurement decorator
 */
export function measurePerformance<T extends (...args: any[]) => any>(
  fn: T,
  operationName?: string
): T {
  return ((...args: any[]) => {
    const start = performance.now();
    const name = operationName || fn.name || 'anonymous';
    
    try {
      const result = fn(...args);
      
      // Handle async functions
      if (result instanceof Promise) {
        return result.finally(() => {
          const duration = performance.now() - start;
          logger.performance(name, duration, { args: args.length });
        });
      }
      
      // Handle sync functions
      const duration = performance.now() - start;
      logger.performance(name, duration, { args: args.length });
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      logger.error(`Performance measurement failed for ${name}`, error as Error, {
        duration,
        args: args.length,
      });
      throw error;
    }
  }) as T;
}

/**
 * Logging middleware for async operations
 */
export function withLogging<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: {
    component?: string;
    operation?: string;
    logArgs?: boolean;
    logResult?: boolean;
  } = {}
): T {
  const { component, operation, logArgs = false, logResult = false } = options;
  
  return (async (...args: any[]) => {
    const operationName = operation || fn.name || 'async-operation';
    const context: Record<string, unknown> = { operation: operationName };
    
    if (component) {
      context.component = component;
    }
    
    if (logArgs) {
      context.args = args;
    }
    
    logger.debug(`Starting ${operationName}`, context);
    
    const start = performance.now();
    
    try {
      const result = await fn(...args);
      const duration = performance.now() - start;
      
      const successContext = { ...context, duration };
      if (logResult) {
        successContext.result = result;
      }
      
      logger.info(`Completed ${operationName}`, successContext);
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      
      logger.error(`Failed ${operationName}`, error as Error, {
        ...context,
        duration,
      });
      
      throw error;
    }
  }) as T;
}

/**
 * Log levels for easy import
 */
export { LogLevel as Level };

/**
 * Structured logging utilities
 */
export const Log = {
  debug: (message: string, context?: Record<string, unknown>) => logger.debug(message, context),
  info: (message: string, context?: Record<string, unknown>) => logger.info(message, context),
  warn: (message: string, context?: Record<string, unknown>) => logger.warn(message, context),
  error: (message: string, error?: Error, context?: Record<string, unknown>) => logger.error(message, error, context),
  critical: (message: string, error?: Error, context?: Record<string, unknown>) => logger.critical(message, error, context),
  
  performance: (operation: string, duration: number, context?: Record<string, unknown>) => logger.performance(operation, duration, context),
  security: (event: string, context?: Record<string, unknown>) => logger.security(event, context),
  audit: (action: string, context?: Record<string, unknown>) => logger.audit(action, context),
  business: (event: string, context?: Record<string, unknown>) => logger.business(event, context),
};