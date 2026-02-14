/**
 * Azure API Retry Strategy
 * Implements exponential backoff with jitter for Azure REST API calls.
 * Respects Retry-After and x-ms-ratelimit headers from Azure.
 */

import { logger } from './logger.js';

export interface AzureRetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
  /** Additional Azure-specific headers to check for retry delay (beyond standard Retry-After) */
  retryAfterHeaders?: string[];
  /** Per-request timeout in ms (prevents indefinite hangs). Default: 45000 */
  requestTimeoutMs?: number;
}

export const DEFAULT_AZURE_RETRY_CONFIG: AzureRetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.2,
  requestTimeoutMs: 45000,
};

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

function calculateDelay(attempt: number, config: AzureRetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = exponentialDelay * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

function getRetryDelay(response: Response, attempt: number, config: AzureRetryConfig): number {
  // Check standard Retry-After header first, then any custom headers
  let retryAfter = response.headers.get('Retry-After');
  if (!retryAfter && config.retryAfterHeaders) {
    for (const header of config.retryAfterHeaders) {
      retryAfter = response.headers.get(header);
      if (retryAfter) break;
    }
  }

  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds) && seconds > 0) {
      // Respect server-requested delay, add small jitter, cap at max
      const jitter = seconds * 1000 * config.jitterFactor * Math.random();
      return Math.min(seconds * 1000 + jitter, config.maxDelayMs);
    }
  }

  return calculateDelay(attempt, config);
}

/**
 * Fetch with retry for Azure REST APIs.
 * Automatically retries on 429, 5xx, and network errors with exponential backoff.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: AzureRetryConfig = DEFAULT_AZURE_RETRY_CONFIG
): Promise<Response> {
  const shortUrl = url.substring(0, 120);
  const perRequestTimeout = config.requestTimeoutMs || 45000;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Add per-request timeout via AbortSignal to prevent indefinite hangs
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), perRequestTimeout);

      let response: Response;
      try {
        response = await fetch(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      if (isRetryableStatus(response.status) && attempt < config.maxRetries) {
        const delayMs = getRetryDelay(response, attempt, config);

        // Drain response body to prevent memory leaks
        await response.text().catch(() => {});

        logger.warn('Azure API error, retrying', {
          status: response.status,
          attempt: attempt + 1,
          maxRetries: config.maxRetries,
          delayMs: Math.round(delayMs),
          url: shortUrl,
        });

        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      return response;
    } catch (err: unknown) {
      if (attempt < config.maxRetries) {
        const delayMs = calculateDelay(attempt, config);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';

        logger.warn('Azure API network error, retrying', {
          error: errorMessage,
          attempt: attempt + 1,
          maxRetries: config.maxRetries,
          delayMs: Math.round(delayMs),
          url: shortUrl,
        });

        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }

  // Unreachable — loop always returns or throws on last attempt
  throw new Error(`Azure API request failed after ${config.maxRetries} retries: ${shortUrl}`);
}
