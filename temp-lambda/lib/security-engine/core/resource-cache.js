"use strict";
/**
 * Security Engine V3 - Resource Cache
 * Caches AWS resources to avoid redundant API calls
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceCache = void 0;
exports.getGlobalCache = getGlobalCache;
exports.resetGlobalCache = resetGlobalCache;
const config_js_1 = require("../config.js");
class ResourceCache {
    constructor(ttl = config_js_1.CACHE_TTL) {
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
        };
        this.ttl = ttl;
    }
    async get(key, fetcher) {
        const cached = this.cache.get(key);
        if (cached && cached.expires > Date.now()) {
            cached.hits++;
            this.stats.hits++;
            return cached.data;
        }
        this.stats.misses++;
        const data = await fetcher();
        this.cache.set(key, {
            data,
            expires: Date.now() + this.ttl,
            hits: 0,
        });
        return data;
    }
    set(key, data, customTtl) {
        this.cache.set(key, {
            data,
            expires: Date.now() + (customTtl || this.ttl),
            hits: 0,
        });
    }
    has(key) {
        const cached = this.cache.get(key);
        return cached !== undefined && cached.expires > Date.now();
    }
    invalidate(key) {
        const existed = this.cache.has(key);
        if (existed) {
            this.cache.delete(key);
            this.stats.evictions++;
        }
        return existed;
    }
    invalidatePattern(pattern) {
        let count = 0;
        for (const key of this.cache.keys()) {
            if (pattern.test(key)) {
                this.cache.delete(key);
                count++;
                this.stats.evictions++;
            }
        }
        return count;
    }
    invalidateByService(service) {
        return this.invalidatePattern(new RegExp(`^${service}:`));
    }
    invalidateByRegion(region) {
        return this.invalidatePattern(new RegExp(`:${region}:`));
    }
    clear() {
        this.stats.evictions += this.cache.size;
        this.cache.clear();
    }
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (entry.expires <= now) {
                this.cache.delete(key);
                cleaned++;
                this.stats.evictions++;
            }
        }
        return cleaned;
    }
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            size: this.cache.size,
            hits: this.stats.hits,
            misses: this.stats.misses,
            evictions: this.stats.evictions,
            hitRate: total > 0 ? this.stats.hits / total : 0,
        };
    }
    resetStats() {
        this.stats = { hits: 0, misses: 0, evictions: 0 };
    }
    // Generate cache key for AWS resources
    static key(service, region, resource, ...args) {
        const parts = [service, region, resource, ...args].filter(Boolean);
        return parts.join(':');
    }
}
exports.ResourceCache = ResourceCache;
// Singleton instance for global caching
let globalCache = null;
function getGlobalCache() {
    if (!globalCache) {
        globalCache = new ResourceCache();
    }
    return globalCache;
}
function resetGlobalCache() {
    if (globalCache) {
        globalCache.clear();
    }
    globalCache = null;
}
//# sourceMappingURL=resource-cache.js.map