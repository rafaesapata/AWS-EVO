/**
 * Batch Operations - Sistema de processamento em lote
 */
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
    errors: Array<{
        item: T;
        error: Error;
    }>;
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
export declare class BatchProcessor {
    private static readonly DEFAULT_CONFIG;
    /**
     * Process items in batches
     */
    static process<T, R>(items: T[], processor: (item: T, index: number) => Promise<R>, config?: Partial<BatchConfig>): Promise<BatchResult<T, R>>;
    private static processWithRetry;
}
/**
 * Database Batch Operations
 */
export declare class DatabaseBatchOperations {
    static batchInsert<T extends Record<string, any>>(records: T[], config?: Partial<BatchConfig>): Promise<BatchResult<T, any>>;
    static batchUpdate<T extends Record<string, any>>(records: T[], config?: Partial<BatchConfig>): Promise<BatchResult<T, any>>;
    static batchDelete<T extends {
        id: string;
    }>(records: T[], config?: Partial<BatchConfig>): Promise<BatchResult<T, {
        deleted: boolean;
    }>>;
}
/**
 * API Batch Operations
 */
export declare class APIBatchOperations {
    static batchApiCall<T, R>(requests: T[], apiCall: (request: T) => Promise<R>, config?: Partial<BatchConfig>): Promise<BatchResult<T, R>>;
    static batchHttpRequest<T extends {
        url: string;
        method?: string;
        data?: any;
    }>(requests: T[], config?: Partial<BatchConfig>): Promise<BatchResult<T, any>>;
}
/**
 * File Batch Operations
 */
export declare class FileBatchOperations {
    static batchFileProcess<T extends {
        path: string;
    }>(files: T[], processor: (file: T) => Promise<any>, config?: Partial<BatchConfig>): Promise<BatchResult<T, any>>;
    static batchFileUpload<T extends {
        path: string;
        destination: string;
    }>(files: T[], config?: Partial<BatchConfig>): Promise<BatchResult<T, {
        uploaded: boolean;
        url?: string;
    }>>;
}
/**
 * Cache Batch Operations
 */
export declare class CacheBatchOperations {
    static batchCacheSet<T extends {
        key: string;
        value: any;
    }>(items: T[], config?: Partial<BatchConfig>): Promise<BatchResult<T, boolean>>;
    static batchCacheGet<T extends {
        key: string;
    }>(keys: T[], config?: Partial<BatchConfig>): Promise<BatchResult<T, any>>;
    static batchCacheDelete<T extends {
        key: string;
    }>(keys: T[], config?: Partial<BatchConfig>): Promise<BatchResult<T, boolean>>;
}
/**
 * EVO Batch Operations - Specific to EVO UDS
 */
export declare class EVOBatchOperations {
    static batchSecurityScan<T extends {
        accountId: string;
        region: string;
    }>(accounts: T[], config?: Partial<BatchConfig>): Promise<BatchResult<T, any>>;
    static batchComplianceCheck<T extends {
        resourceId: string;
        framework: string;
    }>(resources: T[], config?: Partial<BatchConfig>): Promise<BatchResult<T, any>>;
    static batchCostAnalysis<T extends {
        accountId: string;
        service: string;
    }>(services: T[], config?: Partial<BatchConfig>): Promise<BatchResult<T, any>>;
}
//# sourceMappingURL=batch-operations.d.ts.map