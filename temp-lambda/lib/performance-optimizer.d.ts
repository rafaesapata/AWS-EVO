/**
 * Advanced Performance Optimizer
 * Military-grade performance optimization with intelligent caching and resource management
 */
import { EventEmitter } from 'events';
export interface PerformanceMetrics {
    timestamp: Date;
    cpuUsage: number;
    memoryUsage: number;
    eventLoopLag: number;
    activeConnections: number;
    requestsPerSecond: number;
    averageResponseTime: number;
    errorRate: number;
    cacheHitRate: number;
    databaseConnections: number;
}
export interface CacheConfig {
    ttl: number;
    maxSize: number;
    strategy: 'lru' | 'lfu' | 'fifo' | 'adaptive';
    compression: boolean;
    encryption: boolean;
}
export interface OptimizationRule {
    id: string;
    name: string;
    condition: (metrics: PerformanceMetrics) => boolean;
    action: (metrics: PerformanceMetrics) => Promise<void>;
    priority: 'critical' | 'high' | 'medium' | 'low';
    cooldownMs: number;
}
export declare class PerformanceOptimizer extends EventEmitter {
    private config;
    private prisma;
    private cache;
    private cacheStats;
    private optimizationRules;
    private lastOptimization;
    private performanceHistory;
    private monitoringInterval?;
    private isOptimizing;
    constructor(config: CacheConfig);
    /**
     * Initialize performance optimization rules
     */
    private initializeOptimizationRules;
    /**
     * Start performance monitoring
     */
    private startPerformanceMonitoring;
    /**
     * Stop performance monitoring
     */
    stopMonitoring(): void;
    /**
     * Collect current performance metrics
     */
    private collectPerformanceMetrics;
    /**
     * Evaluate optimization rules
     */
    private evaluateOptimizationRules;
    /**
     * Advanced caching with intelligent strategies
     */
    get<T>(key: string, organizationId?: string): Promise<T | null>;
    /**
     * Set cache entry with intelligent optimization
     */
    set<T>(key: string, value: T, ttl?: number, organizationId?: string): Promise<void>;
    /**
     * Intelligent cache eviction
     */
    private ensureCacheCapacity;
    /**
     * Select entries for eviction based on strategy
     */
    private selectEntriesForEviction;
    /**
     * Calculate eviction score for adaptive strategy
     */
    private calculateEvictionScore;
    /**
     * Memory usage optimization
     */
    private optimizeMemoryUsage;
    /**
     * CPU usage optimization
     */
    private optimizeCpuUsage;
    /**
     * Event loop lag optimization
     */
    private optimizeEventLoop;
    /**
     * Cache strategy optimization
     */
    private optimizeCacheStrategy;
    /**
     * Database connections optimization
     */
    private optimizeDatabaseConnections;
    /**
     * Response time optimization
     */
    private optimizeResponseTime;
    /**
     * Helper methods
     */
    private getCpuUsage;
    private measureEventLoopLag;
    private getActiveConnections;
    private calculateRequestsPerSecond;
    private calculateAverageResponseTime;
    private calculateErrorRate;
    private calculateCacheHitRate;
    private getDatabaseConnections;
    private getCurrentCacheSize;
    private isExpired;
    private clearExpiredEntries;
    private cleanupPerformanceHistory;
    private compress;
    private decompress;
    private encrypt;
    private decrypt;
    /**
     * Get performance statistics
     */
    getPerformanceStats(): {
        cache: {
            hits: number;
            misses: number;
            evictions: number;
            totalRequests: number;
        };
        currentMetrics: PerformanceMetrics | null;
        optimizationHistory: Array<{
            rule: string;
            timestamp: number;
        }>;
    };
}
export declare const performanceOptimizer: PerformanceOptimizer;
//# sourceMappingURL=performance-optimizer.d.ts.map