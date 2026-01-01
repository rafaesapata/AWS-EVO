/**
 * Security Engine V2 - Parallel Executor
 * Multi-level parallelization for scanning AWS resources
 */
import type { ParallelizationConfig, ServiceMetric } from '../types.js';
interface PoolResult<T> {
    results: T[];
    errors: Array<{
        item: any;
        error: Error;
    }>;
    duration: number;
}
export declare class ParallelExecutor {
    private config;
    private metrics;
    constructor(config?: Partial<ParallelizationConfig>);
    /**
     * Execute tasks in parallel with concurrency limit
     */
    executePool<T, R>(items: T[], processor: (item: T) => Promise<R>, concurrency: number, onError?: (error: Error, item: T) => void): Promise<PoolResult<R>>;
    /**
     * Execute regions in parallel
     */
    executeRegions<T>(regions: string[], processor: (region: string) => Promise<T[]>, onError?: (error: Error, region: string) => void): Promise<T[]>;
    /**
     * Execute services in parallel within a region
     */
    executeServices<T>(services: string[], region: string, processor: (service: string, region: string) => Promise<T[]>, onError?: (error: Error, service: string) => void): Promise<T[]>;
    /**
     * Execute checks in parallel within a service
     */
    executeChecks<T>(checks: Array<() => Promise<T | null>>, onError?: (error: Error, index: number) => void): Promise<T[]>;
    /**
     * Execute with retry logic
     */
    executeWithRetry<T>(operation: () => Promise<T>, context: string, retries?: number): Promise<T>;
    /**
     * Execute with timeout
     */
    private executeWithTimeout;
    /**
     * Record metrics for a service scan
     */
    recordMetric(service: string, region: string, duration: number, findings: number, errors?: number): void;
    /**
     * Get all recorded metrics
     */
    getMetrics(): Map<string, ServiceMetric>;
    /**
     * Get metrics summary
     */
    getMetricsSummary(): {
        totalDuration: number;
        totalFindings: number;
        totalErrors: number;
        servicesScanned: number;
    };
    /**
     * Reset metrics
     */
    resetMetrics(): void;
    /**
     * Split array into chunks
     */
    private chunk;
    /**
     * Delay execution
     */
    private delay;
}
/**
 * Batch processor for findings persistence
 */
export declare class BatchProcessor<T> {
    private buffer;
    private batchSize;
    private onFlush;
    constructor(batchSize: number, onFlush: (items: T[]) => Promise<void>);
    add(item: T): Promise<void>;
    addMany(items: T[]): Promise<void>;
    flush(): Promise<void>;
    getBufferSize(): number;
}
export {};
//# sourceMappingURL=parallel-executor.d.ts.map