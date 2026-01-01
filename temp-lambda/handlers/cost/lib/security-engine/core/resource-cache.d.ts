/**
 * Security Engine V2 - Resource Cache
 * Caches AWS resources to avoid redundant API calls
 */
export declare class ResourceCache {
    private cache;
    private ttl;
    private stats;
    constructor(ttl?: number);
    get<T>(key: string, fetcher: () => Promise<T>): Promise<T>;
    set<T>(key: string, data: T, customTtl?: number): void;
    has(key: string): boolean;
    invalidate(key: string): boolean;
    invalidatePattern(pattern: RegExp): number;
    invalidateByService(service: string): number;
    invalidateByRegion(region: string): number;
    clear(): void;
    cleanup(): number;
    getStats(): {
        size: number;
        hits: number;
        misses: number;
        evictions: number;
        hitRate: number;
    };
    resetStats(): void;
    static key(service: string, region: string, resource: string, ...args: string[]): string;
}
export declare function getGlobalCache(): ResourceCache;
export declare function resetGlobalCache(): void;
//# sourceMappingURL=resource-cache.d.ts.map