/**
 * Console Monitor
 * Captures and categorizes browser console errors, warnings, and network failures
 */

import type { Page, Response, Request } from '@playwright/test';

export enum ErrorCategory {
  API_ERROR = 'API_ERROR',
  JS_ERROR = 'JS_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CORS_ERROR = 'CORS_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  WARNING = 'WARNING',
  UNKNOWN = 'UNKNOWN'
}

export interface CapturedError {
  id: string;
  timestamp: Date;
  pageUrl: string;
  menuItem: string;
  category: ErrorCategory;
  message: string;
  stack?: string;
  screenshotPath?: string;
  isNew: boolean;
  requestUrl?: string;
  statusCode?: number;
}

export class ConsoleMonitor {
  private errors: CapturedError[] = [];
  private warnings: CapturedError[] = [];
  private currentMenuItem: string = '';
  private page: Page | null = null;
  private errorIdCounter = 0;

  /**
   * Start monitoring console events on a page
   */
  start(page: Page): void {
    this.page = page;
    
    // Listen for console messages
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      
      if (type === 'error') {
        this.captureError(text, ErrorCategory.JS_ERROR);
      } else if (type === 'warning') {
        this.captureWarning(text);
      }
    });

    // Listen for page errors (uncaught exceptions)
    page.on('pageerror', (error) => {
      this.captureError(error.message, ErrorCategory.JS_ERROR, error.stack);
    });

    // Listen for failed requests
    page.on('requestfailed', (request) => {
      const failure = request.failure();
      const errorText = failure?.errorText || 'Request failed';
      this.captureError(
        `Request failed: ${request.url()} - ${errorText}`,
        this.categorizeError(errorText),
        undefined,
        request.url()
      );
    });

    // Listen for response errors (4xx, 5xx)
    page.on('response', (response) => {
      const status = response.status();
      if (status >= 400) {
        const category = this.categorizeByStatus(status);
        this.captureError(
          `HTTP ${status}: ${response.url()}`,
          category,
          undefined,
          response.url(),
          status
        );
      }
    });
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.page = null;
  }

  /**
   * Set current menu item being tested
   */
  setCurrentMenuItem(menuItem: string): void {
    this.currentMenuItem = menuItem;
  }

  /**
   * Capture an error
   */
  private captureError(
    message: string,
    category: ErrorCategory,
    stack?: string,
    requestUrl?: string,
    statusCode?: number
  ): void {
    // Filter out expected aborted requests during navigation
    // These are normal browser behavior when navigating away from a page
    if (message.includes('ERR_ABORTED') || message.includes('net::ERR_ABORTED')) {
      console.log(`[ConsoleMonitor] Ignoring expected aborted request: ${requestUrl || message}`);
      return;
    }
    
    const error: CapturedError = {
      id: `err-${++this.errorIdCounter}`,
      timestamp: new Date(),
      pageUrl: this.page?.url() || '',
      menuItem: this.currentMenuItem,
      category,
      message,
      stack,
      isNew: true,
      requestUrl,
      statusCode,
    };
    this.errors.push(error);
  }

  /**
   * Capture a warning
   */
  private captureWarning(message: string): void {
    const warning: CapturedError = {
      id: `warn-${++this.errorIdCounter}`,
      timestamp: new Date(),
      pageUrl: this.page?.url() || '',
      menuItem: this.currentMenuItem,
      category: ErrorCategory.WARNING,
      message,
      isNew: true,
    };
    this.warnings.push(warning);
  }

  /**
   * Categorize error by message content
   */
  categorizeError(message: string): ErrorCategory {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('cors') || lowerMessage.includes('access-control') || lowerMessage.includes('cross-origin')) {
      return ErrorCategory.CORS_ERROR;
    }
    if (lowerMessage.includes('401') || lowerMessage.includes('unauthorized') || lowerMessage.includes('authentication') || lowerMessage.includes('not authenticated')) {
      return ErrorCategory.AUTH_ERROR;
    }
    if (lowerMessage.includes('fetch') || lowerMessage.includes('network') || lowerMessage.includes('failed to load') || lowerMessage.includes('net::')) {
      return ErrorCategory.NETWORK_ERROR;
    }
    if (lowerMessage.includes('api') || lowerMessage.includes('500') || lowerMessage.includes('502') || lowerMessage.includes('503') || lowerMessage.includes('504')) {
      return ErrorCategory.API_ERROR;
    }
    if (lowerMessage.includes('typeerror') || lowerMessage.includes('referenceerror') || lowerMessage.includes('syntaxerror') || lowerMessage.includes('cannot read') || lowerMessage.includes('is not defined')) {
      return ErrorCategory.JS_ERROR;
    }
    
    return ErrorCategory.UNKNOWN;
  }

  /**
   * Categorize by HTTP status code
   */
  private categorizeByStatus(status: number): ErrorCategory {
    if (status === 401 || status === 403) {
      return ErrorCategory.AUTH_ERROR;
    }
    if (status >= 500) {
      return ErrorCategory.API_ERROR;
    }
    if (status >= 400) {
      return ErrorCategory.NETWORK_ERROR;
    }
    return ErrorCategory.UNKNOWN;
  }

  /**
   * Get all captured errors
   */
  getErrors(): CapturedError[] {
    return [...this.errors];
  }

  /**
   * Get all captured warnings
   */
  getWarnings(): CapturedError[] {
    return [...this.warnings];
  }

  /**
   * Get errors by category
   */
  getErrorsByCategory(): Record<ErrorCategory, CapturedError[]> {
    const result: Record<ErrorCategory, CapturedError[]> = {
      [ErrorCategory.API_ERROR]: [],
      [ErrorCategory.JS_ERROR]: [],
      [ErrorCategory.NETWORK_ERROR]: [],
      [ErrorCategory.CORS_ERROR]: [],
      [ErrorCategory.AUTH_ERROR]: [],
      [ErrorCategory.WARNING]: [],
      [ErrorCategory.UNKNOWN]: [],
    };

    for (const error of this.errors) {
      result[error.category].push(error);
    }

    return result;
  }

  /**
   * Get errors by page/menu item
   */
  getErrorsByPage(): Record<string, CapturedError[]> {
    const result: Record<string, CapturedError[]> = {};

    for (const error of this.errors) {
      const key = error.menuItem || error.pageUrl || 'unknown';
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(error);
    }

    return result;
  }

  /**
   * Clear all captured errors and warnings
   */
  clear(): void {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.errors.length;
  }

  /**
   * Get warning count
   */
  getWarningCount(): number {
    return this.warnings.length;
  }

  /**
   * Set screenshot path for errors on current page
   */
  setScreenshotForCurrentPage(screenshotPath: string): void {
    const currentUrl = this.page?.url() || '';
    for (const error of this.errors) {
      if (error.pageUrl === currentUrl && !error.screenshotPath) {
        error.screenshotPath = screenshotPath;
      }
    }
  }
}
