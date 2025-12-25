/**
 * Security Engine V2 - Parallel Executor
 * Multi-level parallelization for scanning AWS resources
 */

import type { Finding, ParallelizationConfig, ServiceMetric } from '../types.js';
import { DEFAULT_PARALLELIZATION_CONFIG } from '../config.js';
import { logger } from '../../logging.js';

interface TaskResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  duration: number;
}

interface PoolResult<T> {
  results: T[];
  errors: Array<{ item: any; error: Error }>;
  duration: number;
}

export class ParallelExecutor {
  private config: ParallelizationConfig;
  private metrics: Map<string, ServiceMetric> = new Map();

  constructor(config: Partial<ParallelizationConfig> = {}) {
    this.config = { ...DEFAULT_PARALLELIZATION_CONFIG, ...config };
  }

  /**
   * Execute tasks in parallel with concurrency limit
   */
  async executePool<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number,
    onError?: (error: Error, item: T) => void
  ): Promise<PoolResult<R>> {
    const startTime = Date.now();
    const results: R[] = [];
    const errors: Array<{ item: T; error: Error }> = [];
    
    // Process items in batches
    const batches = this.chunk(items, concurrency);
    
    for (const batch of batches) {
      const batchPromises = batch.map(async (item) => {
        try {
          const result = await this.executeWithTimeout(
            () => processor(item),
            this.config.timeout
          );
          return { success: true, data: result, item };
        } catch (error) {
          const err = error as Error;
          if (onError) {
            onError(err, item);
          }
          return { success: false, error: err, item };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        if (result.success && result.data !== undefined) {
          results.push(result.data);
        } else if (!result.success && result.error) {
          errors.push({ item: result.item, error: result.error });
        }
      }
    }

    return {
      results,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute regions in parallel
   */
  async executeRegions<T>(
    regions: string[],
    processor: (region: string) => Promise<T[]>,
    onError?: (error: Error, region: string) => void
  ): Promise<T[]> {
    const { results } = await this.executePool(
      regions,
      processor,
      this.config.maxRegionConcurrency,
      onError
    );
    return results.flat();
  }

  /**
   * Execute services in parallel within a region
   */
  async executeServices<T>(
    services: string[],
    region: string,
    processor: (service: string, region: string) => Promise<T[]>,
    onError?: (error: Error, service: string) => void
  ): Promise<T[]> {
    const { results } = await this.executePool(
      services,
      (service) => processor(service, region),
      this.config.maxServiceConcurrency,
      onError
    );
    return results.flat();
  }

  /**
   * Execute checks in parallel within a service
   */
  async executeChecks<T>(
    checks: Array<() => Promise<T | null>>,
    onError?: (error: Error, index: number) => void
  ): Promise<T[]> {
    const indexedChecks = checks.map((check, index) => ({ check, index }));
    
    const { results } = await this.executePool(
      indexedChecks,
      async ({ check }) => check(),
      this.config.maxCheckConcurrency,
      (error, { index }) => onError?.(error, index)
    );
    
    return results.filter((r): r is T => r !== null);
  }

  /**
   * Execute with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string,
    retries: number = this.config.retryCount
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.executeWithTimeout(operation, this.config.timeout);
      } catch (error) {
        lastError = error as Error;
        
        logger.warn(`Attempt ${attempt}/${retries} failed for ${context}`, {
          error: lastError.message,
        });

        if (attempt < retries) {
          // Exponential backoff
          await this.delay(this.config.retryDelay * Math.pow(2, attempt - 1));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout);
      }),
    ]);
  }

  /**
   * Record metrics for a service scan
   */
  recordMetric(service: string, region: string, duration: number, findings: number, errors: number = 0): void {
    const key = `${service}:${region}`;
    const existing = this.metrics.get(key) || { duration: 0, findings: 0, errors: 0, checksRun: 0 };
    
    this.metrics.set(key, {
      duration: existing.duration + duration,
      findings: existing.findings + findings,
      errors: existing.errors + errors,
      checksRun: existing.checksRun + 1,
    });
  }

  /**
   * Get all recorded metrics
   */
  getMetrics(): Map<string, ServiceMetric> {
    return new Map(this.metrics);
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): {
    totalDuration: number;
    totalFindings: number;
    totalErrors: number;
    servicesScanned: number;
  } {
    let totalDuration = 0;
    let totalFindings = 0;
    let totalErrors = 0;

    for (const metric of this.metrics.values()) {
      totalDuration = Math.max(totalDuration, metric.duration);
      totalFindings += metric.findings;
      totalErrors += metric.errors;
    }

    return {
      totalDuration,
      totalFindings,
      totalErrors,
      servicesScanned: this.metrics.size,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Split array into chunks
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Batch processor for findings persistence
 */
export class BatchProcessor<T> {
  private buffer: T[] = [];
  private batchSize: number;
  private onFlush: (items: T[]) => Promise<void>;

  constructor(batchSize: number, onFlush: (items: T[]) => Promise<void>) {
    this.batchSize = batchSize;
    this.onFlush = onFlush;
  }

  async add(item: T): Promise<void> {
    this.buffer.push(item);
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  async addMany(items: T[]): Promise<void> {
    for (const item of items) {
      await this.add(item);
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length > 0) {
      const items = [...this.buffer];
      this.buffer = [];
      await this.onFlush(items);
    }
  }

  getBufferSize(): number {
    return this.buffer.length;
  }
}
