"use strict";
/**
 * Metrics Cache for ML Waste Detection
 *
 * In-memory cache with TTL to reduce redundant CloudWatch API calls.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsCache = void 0;
exports.getMetricsCache = getMetricsCache;
exports.resetMetricsCache = resetMetricsCache;
/**
 * Simple in-memory cache with TTL
 */
class MetricsCache {
    constructor(options = {}) {
        this.cache = new Map();
        this.stats = { hits: 0, misses: 0, size: 0 };
        this.defaultTTL = options.defaultTTL || 300000; // 5 minutes default
        this.maxSize = options.maxSize || 1000;
    }
    /**
     * Generate a cache key from components
     */
    static generateKey(...parts) {
        return parts.filter(p => p !== undefined).join(':');
    }
    /**
     * Get a value from cache
     */
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return undefined;
        }
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            this.stats.misses++;
            this.stats.size = this.cache.size;
            return undefined;
        }
        this.stats.hits++;
        return entry.value;
    }
    /**
     * Set a value in cache
     */
    set(key, value, ttl) {
        // Evict oldest entries if cache is full
        if (this.cache.size >= this.maxSize) {
            this.evictOldest();
        }
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + (ttl || this.defaultTTL),
        });
        this.stats.size = this.cache.size;
    }
    /**
     * Get or set a value using a factory function
     */
    async getOrSet(key, factory, ttl) {
        const cached = this.get(key);
        if (cached !== undefined) {
            return cached;
        }
        const value = await factory();
        this.set(key, value, ttl);
        return value;
    }
    /**
     * Check if a key exists and is not expired
     */
    has(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return false;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            this.stats.size = this.cache.size;
            return false;
        }
        return true;
    }
    /**
     * Delete a key from cache
     */
    delete(key) {
        const result = this.cache.delete(key);
        this.stats.size = this.cache.size;
        return result;
    }
    /**
     * Clear all entries
     */
    clear() {
        this.cache.clear();
        this.stats.size = 0;
    }
    /**
     * Get cache statistics
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            hitRate: total > 0 ? this.stats.hits / total : 0,
        };
    }
    /**
     * Evict expired entries
     */
    evictExpired() {
        const now = Date.now();
        let evicted = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                evicted++;
            }
        }
        this.stats.size = this.cache.size;
        return evicted;
    }
    /**
     * Evict oldest entries to make room
     */
    evictOldest() {
        const entriesToEvict = Math.ceil(this.maxSize * 0.1); // Evict 10%
        const entries = Array.from(this.cache.entries())
            .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
        for (let i = 0; i < entriesToEvict && i < entries.length; i++) {
            this.cache.delete(entries[i][0]);
        }
        this.stats.size = this.cache.size;
    }
}
exports.MetricsCache = MetricsCache;
// Global metrics cache instance
let globalMetricsCache = null;
/**
 * Get the global metrics cache instance
 */
function getMetricsCache() {
    if (!globalMetricsCache) {
        globalMetricsCache = new MetricsCache({
            defaultTTL: 300000, // 5 minutes
            maxSize: 500,
        });
    }
    return globalMetricsCache;
}
/**
 * Reset the global metrics cache (useful for testing)
 */
function resetMetricsCache() {
    if (globalMetricsCache) {
        globalMetricsCache.clear();
    }
    globalMetricsCache = null;
}
//# sourceMappingURL=metrics-cache.js.map