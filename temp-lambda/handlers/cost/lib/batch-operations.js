"use strict";
/**
 * Batch Operations - Sistema de processamento em lote
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVOBatchOperations = exports.CacheBatchOperations = exports.FileBatchOperations = exports.APIBatchOperations = exports.DatabaseBatchOperations = exports.BatchProcessor = void 0;
const logging_js_1 = require("./logging.js");
const metrics_collector_js_1 = require("./metrics-collector.js");
/**
 * Batch Processor
 */
class BatchProcessor {
    /**
     * Process items in batches
     */
    static async process(items, processor, config = {}) {
        const startTime = Date.now();
        const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
        const results = [];
        const errors = [];
        logging_js_1.logger.info('Starting batch processing', {
            totalItems: items.length,
            batchSize: finalConfig.batchSize,
            maxConcurrency: finalConfig.maxConcurrency,
        });
        // Split items into batches
        const batches = [];
        for (let i = 0; i < items.length; i += finalConfig.batchSize) {
            batches.push(items.slice(i, i + finalConfig.batchSize));
        }
        // Process batches with concurrency control
        const semaphore = new Semaphore(finalConfig.maxConcurrency);
        const batchPromises = batches.map(async (batch, batchIndex) => {
            await semaphore.acquire();
            try {
                const batchResults = await Promise.allSettled(batch.map(async (item, itemIndex) => {
                    const globalIndex = batchIndex * finalConfig.batchSize + itemIndex;
                    return this.processWithRetry(item, globalIndex, processor, finalConfig);
                }));
                batchResults.forEach((result, itemIndex) => {
                    if (result.status === 'fulfilled') {
                        results.push(result.value);
                    }
                    else {
                        const globalIndex = batchIndex * finalConfig.batchSize + itemIndex;
                        errors.push({
                            item: batch[itemIndex],
                            error: result.reason,
                        });
                    }
                });
            }
            finally {
                semaphore.release();
            }
        });
        await Promise.all(batchPromises);
        const duration = Date.now() - startTime;
        // Record metrics
        metrics_collector_js_1.metricsCollector.recordTimer('batch_processing_duration', duration);
        metrics_collector_js_1.metricsCollector.recordCounter('batch_processing_items_processed', results.length);
        metrics_collector_js_1.metricsCollector.recordCounter('batch_processing_items_failed', errors.length);
        logging_js_1.logger.info('Batch processing completed', {
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
    static async processWithRetry(item, index, processor, config) {
        let lastError;
        for (let attempt = 0; attempt <= config.retryAttempts; attempt++) {
            try {
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Processing timeout')), config.timeout);
                });
                const processingPromise = processor(item, index);
                return await Promise.race([processingPromise, timeoutPromise]);
            }
            catch (error) {
                lastError = error;
                if (attempt < config.retryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, config.retryDelay * (attempt + 1)));
                }
            }
        }
        throw lastError;
    }
}
exports.BatchProcessor = BatchProcessor;
BatchProcessor.DEFAULT_CONFIG = {
    batchSize: 10,
    maxConcurrency: 3,
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 30000,
};
/**
 * Semaphore for concurrency control
 */
class Semaphore {
    constructor(permits) {
        this.waiting = [];
        this.permits = permits;
    }
    async acquire() {
        if (this.permits > 0) {
            this.permits--;
            return;
        }
        return new Promise(resolve => {
            this.waiting.push(resolve);
        });
    }
    release() {
        this.permits++;
        if (this.waiting.length > 0) {
            const resolve = this.waiting.shift();
            this.permits--;
            resolve();
        }
    }
}
/**
 * Database Batch Operations
 */
class DatabaseBatchOperations {
    static async batchInsert(records, config = {}) {
        return BatchProcessor.process(records, async (record) => {
            // Simulate database insert
            return { id: Math.random().toString(36), ...record };
        }, { batchSize: 100, ...config });
    }
    static async batchUpdate(records, config = {}) {
        return BatchProcessor.process(records, async (record) => {
            // Simulate database update
            return { ...record, updated_at: new Date() };
        }, { batchSize: 50, ...config });
    }
    static async batchDelete(records, config = {}) {
        return BatchProcessor.process(records, async (record) => {
            // Simulate database delete
            return { deleted: true };
        }, { batchSize: 25, ...config });
    }
}
exports.DatabaseBatchOperations = DatabaseBatchOperations;
/**
 * API Batch Operations
 */
class APIBatchOperations {
    static async batchApiCall(requests, apiCall, config = {}) {
        return BatchProcessor.process(requests, async (request) => apiCall(request), { batchSize: 5, maxConcurrency: 2, ...config });
    }
    static async batchHttpRequest(requests, config = {}) {
        return BatchProcessor.process(requests, async (request) => {
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
        }, { batchSize: 3, maxConcurrency: 2, ...config });
    }
}
exports.APIBatchOperations = APIBatchOperations;
/**
 * File Batch Operations
 */
class FileBatchOperations {
    static async batchFileProcess(files, processor, config = {}) {
        return BatchProcessor.process(files, processor, { batchSize: 5, maxConcurrency: 3, ...config });
    }
    static async batchFileUpload(files, config = {}) {
        return BatchProcessor.process(files, async (file) => {
            // Simulate file upload
            await new Promise(resolve => setTimeout(resolve, 1000));
            return {
                uploaded: true,
                url: `https://example.com/${file.destination}`,
            };
        }, { batchSize: 3, maxConcurrency: 2, ...config });
    }
}
exports.FileBatchOperations = FileBatchOperations;
/**
 * Cache Batch Operations
 */
class CacheBatchOperations {
    static async batchCacheSet(items, config = {}) {
        return BatchProcessor.process(items, async (item) => {
            // Simulate cache set
            return true;
        }, { batchSize: 50, ...config });
    }
    static async batchCacheGet(keys, config = {}) {
        return BatchProcessor.process(keys, async (keyObj) => {
            // Simulate cache get
            return `cached_value_for_${keyObj.key}`;
        }, { batchSize: 100, ...config });
    }
    static async batchCacheDelete(keys, config = {}) {
        return BatchProcessor.process(keys, async (keyObj) => {
            // Simulate cache delete
            return true;
        }, { batchSize: 50, ...config });
    }
}
exports.CacheBatchOperations = CacheBatchOperations;
/**
 * EVO Batch Operations - Specific to EVO UDS
 */
class EVOBatchOperations {
    static async batchSecurityScan(accounts, config = {}) {
        return BatchProcessor.process(accounts, async (account) => {
            // Simulate security scan
            await new Promise(resolve => setTimeout(resolve, 5000));
            return {
                accountId: account.accountId,
                region: account.region,
                findings: Math.floor(Math.random() * 10),
                status: 'completed',
            };
        }, { batchSize: 2, maxConcurrency: 1, timeout: 60000, ...config });
    }
    static async batchComplianceCheck(resources, config = {}) {
        return BatchProcessor.process(resources, async (resource) => {
            // Simulate compliance check
            return {
                resourceId: resource.resourceId,
                framework: resource.framework,
                compliant: Math.random() > 0.3,
                violations: Math.floor(Math.random() * 5),
            };
        }, { batchSize: 10, ...config });
    }
    static async batchCostAnalysis(services, config = {}) {
        return BatchProcessor.process(services, async (service) => {
            // Simulate cost analysis
            return {
                accountId: service.accountId,
                service: service.service,
                monthlyCost: Math.random() * 1000,
                trend: Math.random() > 0.5 ? 'increasing' : 'decreasing',
            };
        }, { batchSize: 5, ...config });
    }
}
exports.EVOBatchOperations = EVOBatchOperations;
// Classes are already exported above
//# sourceMappingURL=batch-operations.js.map