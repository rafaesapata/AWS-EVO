/**
 * In-Memory Cache for Platform Metrics
 * 
 * LRU cache with TTL, hit/miss tracking, and size-based eviction.
 * Optimized for Lambda cold starts and CloudWatch API reduction.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccess: number;
}

interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  totalMemoryEstimateKB: number;
}

class MetricsCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxSize: number = 1000;
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  /**
   * Get cached value if not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update access tracking (LRU)
    entry.accessCount++;
    entry.lastAccess = now;
    this.hits++;

    return entry.data as T;
  }

  /**
   * Set value with TTL (default 60 seconds)
   */
  set<T>(key: string, data: T, ttlMs: number = 60000): void {
    // Evict LRU entries if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
      accessCount: 0,
      lastAccess: Date.now(),
    });
  }

  /**
   * Get or fetch with cache
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number = 60000
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await fetcher();
    this.set(key, data, ttlMs);
    return data;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.evictions++;
    }
  }

  /**
   * Invalidate cache entries matching pattern
   */
  invalidate(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Purge expired entries proactively
   */
  purgeExpired(): number {
    const now = Date.now();
    let purged = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        purged++;
      }
    }
    return purged;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get cache stats with hit rate
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? Math.round((this.hits / total) * 10000) / 100 : 0,
      evictions: this.evictions,
      totalMemoryEstimateKB: Math.round(this.cache.size * 2), // rough estimate
    };
  }
}

// Singleton instance
export const metricsCache = new MetricsCache();
