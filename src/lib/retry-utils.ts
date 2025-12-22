/**
 * Retry utilities with exponential backoff and jitter
 * Prevents thundering herd problem when multiple retries happen simultaneously
 */

export interface RetryConfig {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig = {}
): number {
  const { baseDelay, maxDelay, backoffMultiplier, jitter } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Exponential backoff: baseDelay * (multiplier ^ attempt)
  let delay = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt), maxDelay);

  // Add jitter to prevent synchronized retries (thundering herd)
  if (jitter) {
    // Full jitter: random value between 0 and calculated delay
    delay = Math.random() * delay;
  }

  return Math.floor(delay);
}

/**
 * Execute a function with automatic retry on failure
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const { maxAttempts } = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // If this was the last attempt, throw the error
      if (attempt === maxAttempts - 1) {
        throw lastError;
      }

      // Calculate delay for next retry
      const delay = calculateRetryDelay(attempt, config);
      console.warn(
        `Retry attempt ${attempt + 1}/${maxAttempts} after ${delay}ms. Error:`,
        lastError.message
      );

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: any): boolean {
  // Network errors
  if (error.name === 'NetworkError' || error.name === 'TypeError') {
    return true;
  }

  // Timeout errors
  if (error.name === 'AbortError' || error.message?.includes('timeout')) {
    return true;
  }

  // HTTP status codes that should be retried
  if (error.status) {
    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    return retryableStatuses.includes(error.status);
  }

  // AWS specific errors
  if (error.code) {
    const retryableCodes = ['ThrottlingException', 'ServiceUnavailableException']; // AWS throttling/service errors
    return retryableCodes.includes(error.code);
  }

  return false;
}

/**
 * Retry only if error is retryable
 */
export async function withSmartRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const { maxAttempts } = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (!isRetryableError(error)) {
        throw lastError;
      }

      // If this was the last attempt, throw the error
      if (attempt === maxAttempts - 1) {
        throw lastError;
      }

      const delay = calculateRetryDelay(attempt, config);
      console.warn(
        `Retryable error detected. Attempt ${attempt + 1}/${maxAttempts} after ${delay}ms:`,
        lastError.message
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
