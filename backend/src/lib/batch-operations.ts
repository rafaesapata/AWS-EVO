/**
 * Batch Operations - Sistema de processamento em lote
 */

import { logger } from './logging.js';
import { metricsCollector } from './metrics-collector.js';

export interface BatchConfig {
  batchSize?: number;
  maxConcurrency?: number;
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface BatchResult<T, R> {
  success: boolean;
  processed: number;
  failed: number;
  results: R[];
  errors: Array<{ item: T; error: Error }>;
  duration: number;
}

export interface BatchProcessorOptions<T, R> {
  items: T[];
  processor: (item: T, index: number) => Promise<R>;
  config: BatchConfig;
}

/**
 * Batch Processor
 */
export class BatchProcessor {
  private static readonly DEFAULT_CONFIG: BatchConfig = {
    batchSize: 10,
    maxConcurrency: 3,
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 30000,
  };

  /**
   * Process items in batches
   */
  static async process<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    config: Partial<BatchConfig> = {}
  ): Promise<BatchResult<T, R>> {
    const startTime = Date.now();
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    
    const results: R[] = [];
    const errors: Array<{ item: T; error: Error }> = [];
    
    logger.info('Starting batch processing', {
      totalItems: items.length,
      batchSize: finalConfig.batchSize,
      maxConcurrency: finalConfig.maxConcurrency,
    });

    // Split items into batches
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += finalConfig.batchSize!) {
      batches.push(items.slice(i, i + finalConfig.batchSize!));
    }

    // Process batches with concurrency control
    const semaphore = new Semaphore(finalConfig.maxConcurrency!);
    
    const batchPromises = batches.map(async (batch, batchIndex) => {
      await semaphore.acquire();
      
      try {
        const batchResults = await Promise.allSettled(
          batch.map(async (item, itemIndex) => {
            const globalIndex = batchIndex * finalConfig.batchSize! + itemIndex;
            return this.processWithRetry(item, globalIndex, processor, finalConfig);
          })
        );

        batchResults.forEach((result, itemIndex) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            const globalIndex = batchIndex * finalConfig.batchSize! + itemIndex;
            errors.push({
              item: batch[itemIndex],
              error: result.reason,
            });
          }
        });
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(batchPromises);

    const duration = Date.now() - startTime;
    
    // Record metrics
    metricsCollector.recordTimer('batch_processing_duration', duration);
    metricsCollector.recordCounter('batch_processing_items_processed', results.length);
    metricsCollector.recordCounter('batch_processing_items_failed', errors.length);

    logger.info('Batch processing completed', {
      totalItems: items.length,
      processed: results.length,
      failed: errors.length,
      duration,
    });

    return {
      success: errors.length === 0,
      processed: results.length,
      failed: errors.length,
      results,
      errors,
      duration,
    };
  }

  private static async processWithRetry<T, R>(
    item: T,
    index: number,
    processor: (item: T, index: number) => Promise<R>,
    config: BatchConfig
  ): Promise<R> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= config.retryAttempts!; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Processing timeout')), config.timeout);
        });
        
        const processingPromise = processor(item, index);
        
        return await Promise.race([processingPromise, timeoutPromise]);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < config.retryAttempts!) {
          await new Promise(resolve => setTimeout(resolve, config.retryDelay! * (attempt + 1)));
        }
      }
    }
    
    throw lastError!;
  }
}

/**
 * Semaphore for concurrency control
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>(resolve => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()!;
      this.permits--;
      resolve();
    }
  }
}

/**
 * Database Batch Operations
 */
export class DatabaseBatchOperations {
  static async batchInsert<T extends Record<string, any>>(
    records: T[],
    config: Partial<BatchConfig> = {}
  ): Promise<BatchResult<T, any>> {
    return BatchProcessor.process(
      records,
      async (record) => {
        // Simulate database insert
        return { id: Math.random().toString(36), ...record };
      },
      { batchSize: 100, ...config }
    );
  }

  static async batchUpdate<T extends Record<string, any>>(
    records: T[],
    config: Partial<BatchConfig> = {}
  ): Promise<BatchResult<T, any>> {
    return BatchProcessor.process(
      records,
      async (record) => {
        // Simulate database update
        return { ...record, updated_at: new Date() };
      },
      { batchSize: 50, ...config }
    );
  }

  static async batchDelete<T extends { id: string }>(
    records: T[],
    config: Partial<BatchConfig> = {}
  ): Promise<BatchResult<T, { deleted: boolean }>> {
    return BatchProcessor.process(
      records,
      async (record) => {
        // Simulate database delete
        return { deleted: true };
      },
      { batchSize: 25, ...config }
    );
  }
}

/**
 * API Batch Operations
 */
export class APIBatchOperations {
  static async batchApiCall<T, R>(
    requests: T[],
    apiCall: (request: T) => Promise<R>,
    config: Partial<BatchConfig> = {}
  ): Promise<BatchResult<T, R>> {
    return BatchProcessor.process(
      requests,
      async (request) => apiCall(request),
      { batchSize: 5, maxConcurrency: 2, ...config }
    );
  }

  static async batchHttpRequest<T extends { url: string; method?: string; data?: any }>(
    requests: T[],
    config: Partial<BatchConfig> = {}
  ): Promise<BatchResult<T, any>> {
    return BatchProcessor.process(
      requests,
      async (request) => {
        // Simulate HTTP request
        const response = await fetch(request.url, {
          method: request.method || 'GET',
          body: request.data ? JSON.stringify(request.data) : undefined,
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response.json();
      },
      { batchSize: 3, maxConcurrency: 2, ...config }
    );
  }
}

/**
 * File Batch Operations
 */
export class FileBatchOperations {
  static async batchFileProcess<T extends { path: string }>(
    files: T[],
    processor: (file: T) => Promise<any>,
    config: Partial<BatchConfig> = {}
  ): Promise<BatchResult<T, any>> {
    return BatchProcessor.process(
      files,
      processor,
      { batchSize: 5, maxConcurrency: 3, ...config }
    );
  }

  static async batchFileUpload<T extends { path: string; destination: string }>(
    files: T[],
    config: Partial<BatchConfig> = {}
  ): Promise<BatchResult<T, { uploaded: boolean; url?: string }>> {
    return BatchProcessor.process(
      files,
      async (file) => {
        // Simulate file upload
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          uploaded: true,
          url: `https://example.com/${file.destination}`,
        };
      },
      { batchSize: 3, maxConcurrency: 2, ...config }
    );
  }
}

/**
 * Cache Batch Operations
 */
export class CacheBatchOperations {
  static async batchCacheSet<T extends { key: string; value: any }>(
    items: T[],
    config: Partial<BatchConfig> = {}
  ): Promise<BatchResult<T, boolean>> {
    return BatchProcessor.process(
      items,
      async (item) => {
        // Simulate cache set
        return true;
      },
      { batchSize: 50, ...config }
    );
  }

  static async batchCacheGet<T extends { key: string }>(
    keys: T[],
    config: Partial<BatchConfig> = {}
  ): Promise<BatchResult<T, any>> {
    return BatchProcessor.process(
      keys,
      async (keyObj) => {
        // Simulate cache get
        return `cached_value_for_${keyObj.key}`;
      },
      { batchSize: 100, ...config }
    );
  }

  static async batchCacheDelete<T extends { key: string }>(
    keys: T[],
    config: Partial<BatchConfig> = {}
  ): Promise<BatchResult<T, boolean>> {
    return BatchProcessor.process(
      keys,
      async (keyObj) => {
        // Simulate cache delete
        return true;
      },
      { batchSize: 50, ...config }
    );
  }
}

/**
 * EVO Batch Operations - Specific to EVO UDS
 */
export class EVOBatchOperations {
  static async batchSecurityScan<T extends { accountId: string; region: string }>(
    accounts: T[],
    config: Partial<BatchConfig> = {}
  ): Promise<BatchResult<T, any>> {
    return BatchProcessor.process(
      accounts,
      async (account) => {
        // Simulate security scan
        await new Promise(resolve => setTimeout(resolve, 5000));
        return {
          accountId: account.accountId,
          region: account.region,
          findings: Math.floor(Math.random() * 10),
          status: 'completed',
        };
      },
      { batchSize: 2, maxConcurrency: 1, timeout: 60000, ...config }
    );
  }

  static async batchComplianceCheck<T extends { resourceId: string; framework: string }>(
    resources: T[],
    config: Partial<BatchConfig> = {}
  ): Promise<BatchResult<T, any>> {
    return BatchProcessor.process(
      resources,
      async (resource) => {
        // Simulate compliance check
        return {
          resourceId: resource.resourceId,
          framework: resource.framework,
          compliant: Math.random() > 0.3,
          violations: Math.floor(Math.random() * 5),
        };
      },
      { batchSize: 10, ...config }
    );
  }

  static async batchCostAnalysis<T extends { accountId: string; service: string }>(
    services: T[],
    config: Partial<BatchConfig> = {}
  ): Promise<BatchResult<T, any>> {
    return BatchProcessor.process(
      services,
      async (service) => {
        // Simulate cost analysis
        return {
          accountId: service.accountId,
          service: service.service,
          monthlyCost: Math.random() * 1000,
          trend: Math.random() > 0.5 ? 'increasing' : 'decreasing',
        };
      },
      { batchSize: 5, ...config }
    );
  }
}

// Classes are already exported above