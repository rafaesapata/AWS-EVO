/**
 * Frontend Error Reporter
 * Captures and reports errors to the centralized monitoring system
 * 
 * Usage:
 *   import { errorReporter } from '@/lib/error-reporter';
 *   
 *   // In error boundaries or catch blocks:
 *   errorReporter.captureError(error, { componentName: 'MyComponent' });
 *   
 *   // For API errors:
 *   errorReporter.captureApiError(error, '/api/functions/my-endpoint', 500);
 */

import { apiClient } from '@/integrations/aws/api-client';

type ErrorType = 'unhandled_error' | 'api_error' | 'chunk_load_error' | 'network_error' | 'render_error';
type Severity = 'error' | 'warning' | 'critical';

interface ErrorMetadata {
  apiEndpoint?: string;
  statusCode?: number;
  requestId?: string;
  componentName?: string;
  action?: string;
  [key: string]: any;
}

interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
  timestamp: string;
  userId?: string;
  organizationId?: string;
  sessionId?: string;
  errorType: ErrorType;
  severity: Severity;
  metadata?: ErrorMetadata;
}

class ErrorReporter {
  private sessionId: string;
  private userId?: string;
  private organizationId?: string;
  private isEnabled: boolean = true;
  private errorQueue: ErrorReport[] = [];
  private isProcessing: boolean = false;
  private maxQueueSize: number = 50;
  private flushInterval: number = 5000; // 5 seconds

  constructor() {
    this.sessionId = this.generateSessionId();
    this.setupGlobalHandlers();
    this.startFlushInterval();
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Set user context for error reports
   */
  setUserContext(userId: string, organizationId: string): void {
    this.userId = userId;
    this.organizationId = organizationId;
  }

  /**
   * Clear user context (on logout)
   */
  clearUserContext(): void {
    this.userId = undefined;
    this.organizationId = undefined;
  }

  /**
   * Enable/disable error reporting
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Capture a generic error
   */
  captureError(
    error: Error | string,
    metadata?: ErrorMetadata,
    severity: Severity = 'error'
  ): void {
    if (!this.isEnabled) return;

    const errorObj = typeof error === 'string' ? new Error(error) : error;
    
    this.queueError({
      message: errorObj.message,
      stack: errorObj.stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      userId: this.userId,
      organizationId: this.organizationId,
      sessionId: this.sessionId,
      errorType: 'unhandled_error',
      severity,
      metadata,
    });
  }

  /**
   * Capture an API error (5XX responses)
   */
  captureApiError(
    error: Error | string,
    endpoint: string,
    statusCode: number,
    requestId?: string
  ): void {
    if (!this.isEnabled) return;
    if (statusCode < 500) return; // Only capture 5XX errors

    const errorObj = typeof error === 'string' ? new Error(error) : error;
    const severity: Severity = statusCode >= 500 ? 'critical' : 'error';

    this.queueError({
      message: errorObj.message,
      stack: errorObj.stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      userId: this.userId,
      organizationId: this.organizationId,
      sessionId: this.sessionId,
      errorType: 'api_error',
      severity,
      metadata: {
        apiEndpoint: endpoint,
        statusCode,
        requestId,
      },
    });
  }

  /**
   * Capture a React render error (from Error Boundary)
   */
  captureRenderError(
    error: Error,
    componentStack: string,
    componentName?: string
  ): void {
    if (!this.isEnabled) return;

    this.queueError({
      message: error.message,
      stack: error.stack,
      componentStack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      userId: this.userId,
      organizationId: this.organizationId,
      sessionId: this.sessionId,
      errorType: 'render_error',
      severity: 'critical',
      metadata: {
        componentName,
      },
    });
  }

  /**
   * Capture chunk load errors (lazy loading failures)
   */
  captureChunkLoadError(error: Error, chunkName?: string): void {
    if (!this.isEnabled) return;

    this.queueError({
      message: error.message,
      stack: error.stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      userId: this.userId,
      organizationId: this.organizationId,
      sessionId: this.sessionId,
      errorType: 'chunk_load_error',
      severity: 'warning',
      metadata: {
        chunkName,
      },
    });
  }

  /**
   * Capture network errors
   */
  captureNetworkError(error: Error, url?: string): void {
    if (!this.isEnabled) return;

    this.queueError({
      message: error.message,
      stack: error.stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      userId: this.userId,
      organizationId: this.organizationId,
      sessionId: this.sessionId,
      errorType: 'network_error',
      severity: 'error',
      metadata: {
        apiEndpoint: url,
      },
    });
  }

  private queueError(report: ErrorReport): void {
    // Avoid duplicate errors
    const isDuplicate = this.errorQueue.some(
      (e) => e.message === report.message && e.errorType === report.errorType
    );
    
    if (isDuplicate) return;

    // Limit queue size
    if (this.errorQueue.length >= this.maxQueueSize) {
      this.errorQueue.shift(); // Remove oldest
    }

    this.errorQueue.push(report);
    
    // Immediately flush critical errors
    if (report.severity === 'critical') {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.isProcessing || this.errorQueue.length === 0) return;

    this.isProcessing = true;
    const errorsToSend = [...this.errorQueue];
    this.errorQueue = [];

    try {
      // Send errors in batches
      for (const errorReport of errorsToSend) {
        await this.sendError(errorReport);
      }
    } catch (err) {
      // If sending fails, put errors back in queue
      console.error('Failed to send error reports:', err);
      this.errorQueue.unshift(...errorsToSend.slice(0, 10)); // Keep max 10
    } finally {
      this.isProcessing = false;
    }
  }

  private async sendError(report: ErrorReport): Promise<void> {
    try {
      // Try to send to our logging endpoint
      await apiClient.invoke('log-frontend-error', {
        body: report,
        skipAuth: true, // Allow logging even when not authenticated
      });
    } catch (err) {
      // Fallback: log to console in development
      if (import.meta.env.DEV) {
        console.error('[ErrorReporter] Failed to send:', report, err);
      }
    }
  }

  private setupGlobalHandlers(): void {
    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.captureError(event.error || new Error(event.message), {
        action: 'window.onerror',
      });
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error 
        ? event.reason 
        : new Error(String(event.reason));
      
      this.captureError(error, {
        action: 'unhandledrejection',
      });
    });

    // Capture chunk load errors
    window.addEventListener('error', (event) => {
      if (event.target && (event.target as HTMLElement).tagName === 'SCRIPT') {
        const src = (event.target as HTMLScriptElement).src;
        if (src.includes('chunk')) {
          this.captureChunkLoadError(new Error(`Failed to load chunk: ${src}`), src);
        }
      }
    }, true);
  }

  private startFlushInterval(): void {
    setInterval(() => {
      this.flush();
    }, this.flushInterval);

    // Flush on page unload
    window.addEventListener('beforeunload', () => {
      this.flush();
    });
  }
}

// Singleton instance
export const errorReporter = new ErrorReporter();

// Export for use in Error Boundaries
export type { ErrorMetadata, ErrorType, Severity };
