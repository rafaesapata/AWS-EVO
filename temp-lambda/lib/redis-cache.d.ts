/**
 * Redis Cache Implementation
 * High-performance distributed caching system
 *
 * NOTA: Usa cache em memória (não depende de ioredis)
 * Para usar Redis real, adicionar ioredis ao Lambda layer
 */
export interface CacheOptions {
    ttl?: number;
    prefix?: string;
    serialize?: boolean;
    compress?: boolean;
}
export interface CacheStats {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    errors: number;
    hitRate: number;
}
/**
 * Redis Cache Manager
 * Usa cache em memória por padrão (funciona em Lambda sem dependências extras)
 */
export declare class RedisCacheManager {
    private redis;
    private stats;
    private defaultTTL;
    private keyPrefix;
    private useMemoryFallback;
    constructor(options?: any);
    /**
     * Get value from cache
     */
    get<T = any>(key: string, options?: CacheOptions): Promise<T | null>;
    /**
     * Set value in cache
     */
    set(key: string, value: any, options?: CacheOptions): Promise<boolean>;
    /**
     * Delete key from cache
     */
    delete(key: string, options?: CacheOptions): Promise<boolean>;
    /**
     * Check if key exists
     */
    exists(key: string, options?: CacheOptions): Promise<boolean>;
    /**
     * Get multiple keys
     */
    mget<T = any>(keys: string[], options?: CacheOptions): Promise<(T | null)[]>;
    /**
     * Set multiple keys
     */
    mset(keyValuePairs: Array<[string, any]>, options?: CacheOptions): Promise<boolean>;
    /**
     * Increment counter
     */
    increment(key: string, by?: number, options?: CacheOptions): Promise<number>;
    /**
     * Add to set
     */
    sadd(key: string, members: string[], options?: CacheOptions): Promise<number>;
    /**
     * Get set members
     */
    smembers(key: string, options?: CacheOptions): Promise<string[]>;
    /**
     * Remove from set
     */
    srem(key: string, members: string[], options?: CacheOptions): Promise<number>;
    /**
     * Get keys by pattern
     */
    keys(pattern: string, options?: CacheOptions): Promise<string[]>;
    /**
     * Delete keys by pattern
     */
    deletePattern(pattern: string, options?: CacheOptions): Promise<number>;
    /**
     * Get cache statistics
     */
    getStats(): CacheStats;
    /**
     * Clear all cache statistics
     */
    clearStats(): void;
    /**
     * Flush all cache
     */
    flush(): Promise<boolean>;
    /**
     * Close connection
     */
    close(): Promise<void>;
    /**
     * Build full cache key
     */
    private buildKey;
}
export declare function cached(keyGenerator: (...args: any[]) => string, options?: CacheOptions): (target: any, propertyName: string, descriptor: PropertyDescriptor) => void;
export declare function invalidateCache(keyPatterns: string[] | ((...args: any[]) => string[])): (target: any, propertyName: string, descriptor: PropertyDescriptor) => void;
export declare class SecurityCacheManager {
    private cache;
    private prefix;
    constructor(cache: RedisCacheManager);
    cacheFindings(orgId: string, findings: any[], ttl?: number): Promise<void>;
    getFindings(orgId: string): Promise<any[] | null>;
    cacheScanResult(scanId: string, result: any, ttl?: number): Promise<void>;
    getScanResult(scanId: string): Promise<any | null>;
    invalidateOrgCache(orgId: string): Promise<void>;
}
export declare class CostCacheManager {
    private cache;
    private prefix;
    constructor(cache: RedisCacheManager);
    cacheCostData(accountId: string, period: string, data: any, ttl?: number): Promise<void>;
    getCostData(accountId: string, period: string): Promise<any | null>;
    cacheOptimizationRecommendations(accountId: string, recommendations: any[], ttl?: number): Promise<void>;
    getOptimizationRecommendations(accountId: string): Promise<any[] | null>;
}
/**
 * Metrics Cache Manager
 * Specialized cache for CloudWatch metrics with intelligent TTL and period-based caching
 */
export declare class MetricsCacheManager {
    private cache;
    private prefix;
    private readonly PERIOD_TTL;
    constructor(cache: RedisCacheManager);
    /**
     * Gera chave de cache para métricas
     */
    private buildMetricsKey;
    /**
     * Cache de métricas por conta e período
     */
    cacheMetrics(accountId: string, metrics: any[], period?: string): Promise<boolean>;
    /**
     * Buscar métricas do cache
     */
    getMetrics(accountId: string, period?: string): Promise<{
        metrics: any[];
        cachedAt: number;
        fromCache: boolean;
    } | null>;
    /**
     * Cache de recursos descobertos
     */
    cacheResources(accountId: string, resources: any[], ttl?: number): Promise<boolean>;
    /**
     * Buscar recursos do cache
     */
    getResources(accountId: string): Promise<{
        resources: any[];
        cachedAt: number;
        fromCache: boolean;
    } | null>;
    /**
     * Cache de resultado completo de coleta (recursos + métricas)
     */
    cacheCollectionResult(accountId: string, result: {
        resources: any[];
        metrics: any[];
        regionsScanned: string[];
        permissionErrors?: any[];
    }, ttl?: number): Promise<boolean>;
    /**
     * Buscar resultado de coleta do cache
     */
    getCollectionResult(accountId: string): Promise<{
        resources: any[];
        metrics: any[];
        regionsScanned: string[];
        permissionErrors?: any[];
        cachedAt: number;
        fromCache: boolean;
    } | null>;
    /**
     * Invalidar cache de uma conta
     */
    invalidateAccount(accountId: string): Promise<number>;
    /**
     * Invalidar todo o cache de métricas
     */
    invalidateAll(): Promise<number>;
    /**
     * Verificar se cache existe e é válido
     */
    isCacheValid(accountId: string, maxAgeSeconds?: number): Promise<boolean>;
    /**
     * Obter estatísticas do cache de métricas
     */
    getCacheInfo(accountId: string): Promise<{
        hasCache: boolean;
        cacheAge?: number;
        resourceCount?: number;
        metricCount?: number;
    }>;
}
/**
 * Edge Services Cache Manager
 * Specialized cache for CloudFront, WAF, and Load Balancer edge services
 */
export declare class EdgeCacheManager {
    private cache;
    private prefix;
    private readonly PERIOD_TTL;
    constructor(cache: RedisCacheManager);
    /**
     * Cache de serviços de borda descobertos
     */
    cacheEdgeServices(accountId: string, services: any[], ttl?: number): Promise<boolean>;
    /**
     * Buscar serviços de borda do cache
     */
    getEdgeServices(accountId: string): Promise<{
        services: any[];
        cachedAt: number;
        fromCache: boolean;
    } | null>;
    /**
     * Cache de métricas de borda
     */
    cacheEdgeMetrics(accountId: string, metrics: any[], period?: string): Promise<boolean>;
    /**
     * Buscar métricas de borda do cache
     */
    getEdgeMetrics(accountId: string, period?: string): Promise<{
        metrics: any[];
        cachedAt: number;
        fromCache: boolean;
    } | null>;
    /**
     * Cache de resultado completo de descoberta (serviços + métricas)
     */
    cacheDiscoveryResult(accountId: string, result: {
        services: any[];
        metrics: any[];
        regionsScanned: string[];
        permissionErrors?: any[];
        breakdown?: {
            cloudfront: number;
            waf: number;
            loadBalancer: number;
        };
    }, ttl?: number): Promise<boolean>;
    /**
     * Buscar resultado de descoberta do cache
     */
    getDiscoveryResult(accountId: string): Promise<{
        services: any[];
        metrics: any[];
        regionsScanned: string[];
        permissionErrors?: any[];
        breakdown?: {
            cloudfront: number;
            waf: number;
            loadBalancer: number;
        };
        cachedAt: number;
        fromCache: boolean;
    } | null>;
    /**
     * Obter informações do cache
     */
    getCacheInfo(accountId: string): Promise<{
        hasCache: boolean;
        cacheAge?: number;
        serviceCount?: number;
        metricCount?: number;
    }>;
    /**
     * Invalidar cache de uma conta
     */
    invalidateAccount(accountId: string): Promise<number>;
    /**
     * Invalidar todo o cache de edge
     */
    invalidateAll(): Promise<number>;
    /**
     * Verificar se cache existe e é válido
     */
    isCacheValid(accountId: string, maxAgeSeconds?: number): Promise<boolean>;
}
export declare const cacheManager: RedisCacheManager;
export declare const securityCache: SecurityCacheManager;
export declare const costCache: CostCacheManager;
export declare const metricsCache: MetricsCacheManager;
export declare const edgeCache: EdgeCacheManager;
export declare function checkRedisHealth(): Promise<{
    status: 'healthy' | 'unhealthy';
    latency?: number;
    error?: string;
}>;
//# sourceMappingURL=redis-cache.d.ts.map