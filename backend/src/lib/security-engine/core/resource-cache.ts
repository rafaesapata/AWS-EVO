/**
 * Security Engine V3 - Resource Cache
 * Caches AWS resources to avoid redundant API calls
 */

import { CACHE_TTL } from '../config.js';

interface CacheEntry<T> {
  data: T;
  expires: number;
  hits: number;
}

export class ResourceCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private ttl: number;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(ttl: number = CACHE_TTL) {
    this.ttl = ttl;
  }

  async get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    
    if (cached && cached.expires > Date.now()) {
      cached.hits++;
      this.stats.hits++;
      return cached.data as T;
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

  set<T>(key: string, data: T, customTtl?: number): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + (customTtl || this.ttl),
      hits: 0,
    });
  }

  has(key: string): boolean {
    const cached = this.cache.get(key);
    return cached !== undefined && cached.expires > Date.now();
  }

  invalidate(key: string): boolean {
    const existed = this.cache.has(key);
    if (existed) {
      this.cache.delete(key);
      this.stats.evictions++;
    }
    return existed;
  }

  invalidatePattern(pattern: RegExp): number {
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

  invalidateByService(service: string): number {
    return this.invalidatePattern(new RegExp(`^${service}:`));
  }

  invalidateByRegion(region: string): number {
    return this.invalidatePattern(new RegExp(`:${region}:`));
  }

  clear(): void {
    this.stats.evictions += this.cache.size;
    this.cache.clear();
  }

  cleanup(): number {
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

  getStats(): {
    size: number;
    hits: number;
    misses: number;
    evictions: number;
    hitRate: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  // Generate cache key for AWS resources
  static key(service: string, region: string, resource: string, ...args: string[]): string {
    const parts = [service, region, resource, ...args].filter(Boolean);
    return parts.join(':');
  }
}

// Singleton instance for global caching
let globalCache: ResourceCache | null = null;

export function getGlobalCache(): ResourceCache {
  if (!globalCache) {
    globalCache = new ResourceCache();
  }
  return globalCache;
}

export function resetGlobalCache(): void {
  if (globalCache) {
    globalCache.clear();
  }
  globalCache = null;
}
