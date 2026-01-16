/**
 * In-Memory Cache for Platform Metrics
 * 
 * Implements a simple LRU-like cache with TTL for Lambda metrics
 * to reduce CloudWatch API calls and improve response times.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class MetricsCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxSize: number = 1000;

  /**
   * Get cached value if not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      // Expired - remove and return null
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set value with TTL (default 60 seconds)
   */
  set<T>(key: string, data: T, ttlMs: number = 60000): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
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
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

// Singleton instance
export const metricsCache = new MetricsCache();
