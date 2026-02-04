/**
 * Azure API Rate Limiter
 * 
 * Implements intelligent rate limiting for Azure Management API calls.
 * Respects Azure's rate limits and implements exponential backoff.
 */

import { logger } from '../../../../logging.js';

interface RateLimiterConfig {
  maxRequestsPerSecond: number;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequestsPerSecond: 10, // Azure default is ~12 req/sec for ARM
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

export class AzureRateLimiter {
  private config: RateLimiterConfig;
  private requestTimestamps: number[] = [];
  private retryAfterMs = 0;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a request with rate limiting and retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    await this.waitForSlot();

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await operation();
        return result;
      } catch (err: any) {
        lastError = err;
        
        // Check for rate limiting response
        if (this.isRateLimitError(err)) {
          const retryAfter = this.extractRetryAfter(err);
          this.retryAfterMs = retryAfter;
          
          logger.warn('Azure API rate limited', {
            operation: operationName,
            attempt,
            retryAfterMs: retryAfter,
          });

          if (attempt < this.config.maxRetries) {
            await this.sleep(retryAfter);
            continue;
          }
        }

        // Exponential backoff for other errors
        if (attempt < this.config.maxRetries && this.isRetryableError(err)) {
          const delay = Math.min(
            this.config.baseDelayMs * Math.pow(2, attempt),
            this.config.maxDelayMs
          );
          
          logger.warn('Azure API error, retrying', {
            operation: operationName,
            attempt,
            delayMs: delay,
            error: err.message,
          });

          await this.sleep(delay);
          continue;
        }

        throw err;
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Wait for an available request slot
   */
  private async waitForSlot(): Promise<void> {
    // Wait for retry-after if set
    if (this.retryAfterMs > 0) {
      await this.sleep(this.retryAfterMs);
      this.retryAfterMs = 0;
    }

    const now = Date.now();
    const windowStart = now - 1000;

    // Clean old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(t => t > windowStart);

    // Wait if at capacity
    if (this.requestTimestamps.length >= this.config.maxRequestsPerSecond) {
      const oldestInWindow = this.requestTimestamps[0];
      const waitTime = oldestInWindow + 1000 - now;
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
    }

    this.requestTimestamps.push(Date.now());
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(err: any): boolean {
    const status = err.status || err.statusCode || err.response?.status;
    return status === 429 || 
           err.code === 'TooManyRequests' ||
           err.message?.includes('429') ||
           err.message?.includes('rate limit');
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(err: any): boolean {
    const status = err.status || err.statusCode || err.response?.status;
    return status === 429 || 
           status === 500 || 
           status === 502 || 
           status === 503 || 
           status === 504 ||
           err.code === 'ECONNRESET' ||
           err.code === 'ETIMEDOUT';
  }

  /**
   * Extract retry-after value from error
   */
  private extractRetryAfter(err: any): number {
    // Check headers
    const retryAfterHeader = err.response?.headers?.['retry-after'] ||
                            err.headers?.['retry-after'];
    
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }
    }

    // Default backoff
    return this.config.baseDelayMs * 2;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Global rate limiter instance
let globalRateLimiter: AzureRateLimiter | null = null;

export function getGlobalRateLimiter(): AzureRateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new AzureRateLimiter();
  }
  return globalRateLimiter;
}

export function resetGlobalRateLimiter(): void {
  globalRateLimiter = null;
}

/**
 * Convenience function for rate-limited fetch
 */
export async function rateLimitedFetch(
  url: string,
  options: RequestInit,
  operationName?: string
): Promise<Response> {
  const limiter = getGlobalRateLimiter();
  
  return limiter.execute(async () => {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const error: any = new Error('Rate limited');
      error.status = 429;
      error.response = response;
      throw error;
    }
    
    return response;
  }, operationName);
}
