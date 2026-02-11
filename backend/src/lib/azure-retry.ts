/**
 * Azure API Retry Strategy
 * Implements exponential backoff with jitter for Azure REST API calls.
 * Respects Retry-After and x-ms-ratelimit headers from Azure.
 */

import { logger } from './logging.js';

export interface AzureRetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
  /** Additional Azure-specific headers to check for retry delay (beyond standard Retry-After) */
  retryAfterHeaders?: string[];
}

export const DEFAULT_AZURE_RETRY_CONFIG: AzureRetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.2,
};

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 502 || status === 500;
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

  let delayMs: number;

  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    delayMs = isNaN(seconds) ? config.baseDelayMs * Math.pow(2, attempt) : seconds * 1000;
  } else {
    delayMs = config.baseDelayMs * Math.pow(2, attempt);
  }

  // Add jitter and cap
  const jitter = delayMs * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.min(delayMs + jitter, config.maxDelayMs);
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

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (isRetryableStatus(response.status) && attempt < config.maxRetries) {
        const delayMs = getRetryDelay(response, attempt, config);
        logger.warn('Azure API rate limited, retrying', {
          status: response.status,
          attempt,
          delayMs: Math.round(delayMs),
          url: shortUrl,
        });
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      return response;
    } catch (err: unknown) {
      if (attempt < config.maxRetries) {
        const delayMs = config.baseDelayMs * Math.pow(2, attempt);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.warn('Azure API request failed, retrying', {
          error: errorMessage,
          attempt,
          delayMs,
          url: shortUrl,
        });
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }

  // Should not reach here
  throw new Error(`Azure API request failed after ${config.maxRetries} retries: ${shortUrl}`);
}
