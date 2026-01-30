/**
 * Security Engine V3 - AWS Retry Strategy
 * Implements exponential backoff with jitter for AWS API calls
 */

import { logger } from '../../logging.js';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: string[];
  jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 5000,
  retryableErrors: [
    'ThrottlingException',
    'Throttling',
    'TooManyRequestsException',
    'RequestLimitExceeded',
    'ProvisionedThroughputExceededException',
    'ServiceUnavailable',
    'ServiceUnavailableException',
    'InternalError',
    'InternalServiceError',
    'InternalServerError',
    'RequestTimeout',
    'RequestTimeoutException',
    'IDPCommunicationError',
    'EC2ThrottledException',
    'TransactionInProgressException',
    'RequestExpired',
    'BandwidthLimitExceeded',
    'LimitExceededException',
    'SlowDown',
    'PriorRequestNotComplete',
  ],
  jitterFactor: 0.2,
};

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  
  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  
  // Add jitter (±jitterFactor)
  const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1);
  
  return Math.max(0, cappedDelay + jitter);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any, config: RetryConfig): boolean {
  if (!error) return false;
  
  // Check error name
  if (config.retryableErrors.includes(error.name)) {
    return true;
  }
  
  // Check error code
  if (error.code && config.retryableErrors.includes(error.code)) {
    return true;
  }
  
  // Check $metadata for AWS SDK v3 errors
  if (error.$metadata?.httpStatusCode) {
    const statusCode = error.$metadata.httpStatusCode;
    // Retry on 429 (Too Many Requests), 500, 502, 503, 504
    if (statusCode === 429 || statusCode >= 500) {
      return true;
    }
  }
  
  // Check for network errors
  if (error.code === 'ECONNRESET' || 
      error.code === 'ETIMEDOUT' || 
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED') {
    return true;
  }
  
  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute AWS API call with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if we should retry
      if (attempt < fullConfig.maxRetries && isRetryableError(error, fullConfig)) {
        const delay = calculateDelay(attempt, fullConfig);
        
        logger.warn(`[Retry] ${operationName} failed (attempt ${attempt + 1}/${fullConfig.maxRetries + 1}), retrying in ${Math.round(delay)}ms`, {
          errorName: error.name,
          errorCode: error.code,
          statusCode: error.$metadata?.httpStatusCode,
        });
        
        await sleep(delay);
        continue;
      }
      
      // Not retryable or max retries exceeded
      throw error;
    }
  }
  
  // Should never reach here, but TypeScript needs this
  throw lastError;
}

/**
 * Create a retryable wrapper for AWS SDK client commands
 */
export function createRetryableClient<TClient>(
  client: TClient,
  config: Partial<RetryConfig> = {}
): TClient & { sendWithRetry: <T>(command: any, operationName?: string) => Promise<T> } {
  const wrappedClient = client as TClient & { 
    sendWithRetry: <T>(command: any, operationName?: string) => Promise<T> 
  };
  
  wrappedClient.sendWithRetry = async <T>(command: any, operationName?: string): Promise<T> => {
    const opName = operationName || command.constructor?.name || 'UnknownCommand';
    return withRetry(
      () => (client as any).send(command),
      opName,
      config
    );
  };
  
  return wrappedClient;
}

/**
 * Batch operations with retry and rate limiting
 */
export async function batchWithRetry<TInput, TOutput>(
  items: TInput[],
  operation: (item: TInput) => Promise<TOutput>,
  options: {
    batchSize?: number;
    delayBetweenBatches?: number;
    retryConfig?: Partial<RetryConfig>;
    operationName?: string;
  } = {}
): Promise<{ results: TOutput[]; errors: Array<{ item: TInput; error: Error }> }> {
  const {
    batchSize = 10,
    delayBetweenBatches = 100,
    retryConfig = {},
    operationName = 'BatchOperation',
  } = options;
  
  const results: TOutput[] = [];
  const errors: Array<{ item: TInput; error: Error }> = [];
  
  // Process in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // Process batch items in parallel
    const batchResults = await Promise.allSettled(
      batch.map((item, index) =>
        withRetry(
          () => operation(item),
          `${operationName}[${i + index}]`,
          retryConfig
        )
      )
    );
    
    // Collect results and errors
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        errors.push({ item: batch[index], error: result.reason });
      }
    });
    
    // Delay between batches to avoid throttling
    if (i + batchSize < items.length && delayBetweenBatches > 0) {
      await sleep(delayBetweenBatches);
    }
  }
  
  return { results, errors };
}
