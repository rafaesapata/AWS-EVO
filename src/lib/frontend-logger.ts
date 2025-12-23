/**
 * Frontend Logger
 * Centralized logging with production safety
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  level: LogLevel;
  enableInProduction: boolean;
  sendToServer: boolean;
}

class FrontendLogger {
  private config: LoggerConfig;
  private logLevels = { debug: 0, info: 1, warn: 2, error: 3 };

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: import.meta.env.PROD ? 'warn' : 'debug',
      enableInProduction: false,
      sendToServer: import.meta.env.PROD,
      ...config,
    };
  }

  private shouldLog(level: LogLevel): boolean {
    if (import.meta.env.PROD && !this.config.enableInProduction) {
      return level === 'error';
    }
    return this.logLevels[level] >= this.logLevels[this.config.level];
  }

  private sanitize(data: unknown): unknown {
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential', 'authorization'];
    
    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data)) {
        return data.map(item => this.sanitize(item));
      }
      
      return Object.fromEntries(
        Object.entries(data).map(([k, v]) => [
          k,
          sensitiveKeys.some(sk => k.toLowerCase().includes(sk))
            ? '[REDACTED]'
            : this.sanitize(v)
        ])
      );
    }
    return data;
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}`, this.sanitize(data));
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      console.info(`[INFO] ${message}`, this.sanitize(data));
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, this.sanitize(data));
    }
  }

  error(message: string, error?: Error | unknown, data?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, error, this.sanitize(data));
      
      if (this.config.sendToServer) {
        this.sendToServer('error', message, error, data);
      }
    }
  }

  private async sendToServer(
    level: LogLevel,
    message: string,
    error?: Error | unknown,
    data?: unknown
  ): Promise<void> {
    try {
      // Only send in production and if API is available
      if (!import.meta.env.PROD) return;
      
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level,
          message,
          error: error instanceof Error ? error.stack : String(error),
          data: this.sanitize(data),
          timestamp: new Date().toISOString(),
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
      });
    } catch {
      // Silently fail - don't create infinite loop
    }
  }
}

export const logger = new FrontendLogger();
