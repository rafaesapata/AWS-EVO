/**
 * Metrics Cache for ML Waste Detection
 *
 * In-memory cache with TTL to reduce redundant CloudWatch API calls.
 */
interface CacheStats {
    hits: number;
    misses: number;
    size: number;
}
/**
 * Simple in-memory cache with TTL
 */
export declare class MetricsCache<T = any> {
    private cache;
    private stats;
    private defaultTTL;
    private maxSize;
    constructor(options?: {
        defaultTTL?: number;
        maxSize?: number;
    });
    /**
     * Generate a cache key from components
     */
    static generateKey(...parts: (string | number | undefined)[]): string;
    /**
     * Get a value from cache
     */
    get(key: string): T | undefined;
    /**
     * Set a value in cache
     */
    set(key: string, value: T, ttl?: number): void;
    /**
     * Get or set a value using a factory function
     */
    getOrSet(key: string, factory: () => Promise<T>, ttl?: number): Promise<T>;
    /**
     * Check if a key exists and is not expired
     */
    has(key: string): boolean;
    /**
     * Delete a key from cache
     */
    delete(key: string): boolean;
    /**
     * Clear all entries
     */
    clear(): void;
    /**
     * Get cache statistics
     */
    getStats(): CacheStats & {
        hitRate: number;
    };
    /**
     * Evict expired entries
     */
    evictExpired(): number;
    /**
     * Evict oldest entries to make room
     */
    private evictOldest;
}
/**
 * Get the global metrics cache instance
 */
export declare function getMetricsCache(): MetricsCache;
/**
 * Reset the global metrics cache (useful for testing)
 */
export declare function resetMetricsCache(): void;
export {};
//# sourceMappingURL=metrics-cache.d.ts.map