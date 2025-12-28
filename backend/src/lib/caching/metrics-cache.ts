/**
 * Metrics Cache for ML Waste Detection
 * 
 * In-memory cache with TTL to reduce redundant CloudWatch API calls.
 */

import { logger } from '../logging.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

/**
 * Simple in-memory cache with TTL
 */
export class MetricsCache<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private stats: CacheStats = { hits: 0, misses: 0, size: 0 };
  private defaultTTL: number;
  private maxSize: number;
  
  constructor(options: { defaultTTL?: number; maxSize?: number } = {}) {
    this.defaultTTL = options.defaultTTL || 300000; // 5 minutes default
    this.maxSize = options.maxSize || 1000;
  }
  
  /**
   * Generate a cache key from components
   */
  static generateKey(...parts: (string | number | undefined)[]): string {
    return parts.filter(p => p !== undefined).join(':');
  }
  
  /**
   * Get a value from cache
   */
  get(key: string): T | undefined {
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
  set(key: string, value: T, ttl?: number): void {
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
  async getOrSet(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
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
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
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
  delete(key: string): boolean {
    const result = this.cache.delete(key);
    this.stats.size = this.cache.size;
    return result;
  }
  
  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }
  
  /**
   * Evict expired entries
   */
  evictExpired(): number {
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
  private evictOldest(): void {
    const entriesToEvict = Math.ceil(this.maxSize * 0.1); // Evict 10%
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    
    for (let i = 0; i < entriesToEvict && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }
    
    this.stats.size = this.cache.size;
  }
}

// Global metrics cache instance
let globalMetricsCache: MetricsCache | null = null;

/**
 * Get the global metrics cache instance
 */
export function getMetricsCache(): MetricsCache {
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
export function resetMetricsCache(): void {
  if (globalMetricsCache) {
    globalMetricsCache.clear();
  }
  globalMetricsCache = null;
}
