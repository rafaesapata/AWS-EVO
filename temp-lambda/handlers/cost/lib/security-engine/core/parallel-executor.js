"use strict";
/**
 * Security Engine V2 - Parallel Executor
 * Multi-level parallelization for scanning AWS resources
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchProcessor = exports.ParallelExecutor = void 0;
const config_js_1 = require("../config.js");
const logging_js_1 = require("../../logging.js");
class ParallelExecutor {
    constructor(config = {}) {
        this.metrics = new Map();
        this.config = { ...config_js_1.DEFAULT_PARALLELIZATION_CONFIG, ...config };
    }
    /**
     * Execute tasks in parallel with concurrency limit
     */
    async executePool(items, processor, concurrency, onError) {
        const startTime = Date.now();
        const results = [];
        const errors = [];
        // Process items in batches
        const batches = this.chunk(items, concurrency);
        for (const batch of batches) {
            const batchPromises = batch.map(async (item) => {
                try {
                    const result = await this.executeWithTimeout(() => processor(item), this.config.timeout);
                    return { success: true, data: result, item };
                }
                catch (error) {
                    const err = error;
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
                }
                else if (!result.success && result.error) {
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
    async executeRegions(regions, processor, onError) {
        const { results } = await this.executePool(regions, processor, this.config.maxRegionConcurrency, onError);
        return results.flat();
    }
    /**
     * Execute services in parallel within a region
     */
    async executeServices(services, region, processor, onError) {
        const { results } = await this.executePool(services, (service) => processor(service, region), this.config.maxServiceConcurrency, onError);
        return results.flat();
    }
    /**
     * Execute checks in parallel within a service
     */
    async executeChecks(checks, onError) {
        const indexedChecks = checks.map((check, index) => ({ check, index }));
        const { results } = await this.executePool(indexedChecks, async ({ check }) => check(), this.config.maxCheckConcurrency, (error, { index }) => onError?.(error, index));
        return results.filter((r) => r !== null);
    }
    /**
     * Execute with retry logic
     */
    async executeWithRetry(operation, context, retries = this.config.retryCount) {
        let lastError;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await this.executeWithTimeout(operation, this.config.timeout);
            }
            catch (error) {
                lastError = error;
                logging_js_1.logger.warn(`Attempt ${attempt}/${retries} failed for ${context}`, {
                    error: lastError.message,
                });
                if (attempt < retries) {
                    // Exponential backoff
                    await this.delay(this.config.retryDelay * Math.pow(2, attempt - 1));
                }
            }
        }
        throw lastError;
    }
    /**
     * Execute with timeout
     */
    async executeWithTimeout(operation, timeout) {
        return Promise.race([
            operation(),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout);
            }),
        ]);
    }
    /**
     * Record metrics for a service scan
     */
    recordMetric(service, region, duration, findings, errors = 0) {
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
    getMetrics() {
        return new Map(this.metrics);
    }
    /**
     * Get metrics summary
     */
    getMetricsSummary() {
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
    resetMetrics() {
        this.metrics.clear();
    }
    /**
     * Split array into chunks
     */
    chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
    /**
     * Delay execution
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.ParallelExecutor = ParallelExecutor;
/**
 * Batch processor for findings persistence
 */
class BatchProcessor {
    constructor(batchSize, onFlush) {
        this.buffer = [];
        this.batchSize = batchSize;
        this.onFlush = onFlush;
    }
    async add(item) {
        this.buffer.push(item);
        if (this.buffer.length >= this.batchSize) {
            await this.flush();
        }
    }
    async addMany(items) {
        for (const item of items) {
            await this.add(item);
        }
    }
    async flush() {
        if (this.buffer.length > 0) {
            const items = [...this.buffer];
            this.buffer = [];
            await this.onFlush(items);
        }
    }
    getBufferSize() {
        return this.buffer.length;
    }
}
exports.BatchProcessor = BatchProcessor;
//# sourceMappingURL=parallel-executor.js.map