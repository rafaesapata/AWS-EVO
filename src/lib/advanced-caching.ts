/**
 * Advanced Caching Strategies
 * Provides multi-layer caching with intelligent invalidation
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from './logging';

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
  tags: string[];
  size: number;
}

export interface CacheConfig {
  maxSize: number; // Maximum cache size in bytes
  maxEntries: number; // Maximum number of entries
  defaultTTL: number; // Default TTL in milliseconds
  cleanupInterval: number; // Cleanup interval in milliseconds
  compressionThreshold: number; // Compress entries larger than this
}

export interface CacheStats {
  entries: number;
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

/**
 * Multi-layer cache implementation
 */
export class AdvancedCache {
  private memoryCache = new Map<string, CacheEntry>();
  private stats: CacheStats = {
    entries: 0,
    size: 0,
    hits: 0,
    misses: 0,
    hitRate: 0,
    evictions: 0,
  };
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private config: CacheConfig) {
    this.startCleanup();
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  private cleanup(): void {
    const now = Date.now();
    let evicted = 0;

    // Remove expired entries
    for (const [key, entry] of this.memoryCache) {
      if (now - entry.timestamp > entry.ttl) {
        this.memoryCache.delete(key);
        this.stats.size -= entry.size;
        evicted++;
      }
    }

    // Evict least recently used entries if over limits
    if (this.memoryCache.size > this.config.maxEntries || this.stats.size > this.config.maxSize) {
      const entries = Array.from(this.memoryCache.entries())
        .sort(([, a], [, b]) => a.hits - b.hits || a.timestamp - b.timestamp);

      while (
        (this.memoryCache.size > this.config.maxEntries || this.stats.size > this.config.maxSize) &&
        entries.length > 0
      ) {
        const [key, entry] = entries.shift()!;
        this.memoryCache.delete(key);
        this.stats.size -= entry.size;
        evicted++;
      }
    }

    this.stats.entries = this.memoryCache.size;
    this.stats.evictions += evicted;

    if (evicted > 0) {
      logger.debug(`Cache cleanup: evicted ${evicted} entries`, {
        totalEntries: this.stats.entries,
        totalSize: this.stats.size,
      });
    }
  }

  private calculateSize(data: any): number {
    return JSON.stringify(data).length * 2; // Rough estimate (UTF-16)
  }

  private compress(data: any): any {
    // Simple compression for large objects
    const size = this.calculateSize(data);
    if (size > this.config.compressionThreshold) {
      // In a real implementation, you might use a compression library
      return { __compressed: true, data: JSON.stringify(data) };
    }
    return data;
  }

  private decompress(data: any): any {
    if (data && data.__compressed) {
      return JSON.parse(data.data);
    }
    return data;
  }

  set<T>(key: string, data: T, ttl?: number, tags: string[] = []): void {
    const compressedData = this.compress(data);
    const size = this.calculateSize(compressedData);
    const entry: CacheEntry<T> = {
      data: compressedData,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL,
      hits: 0,
      tags,
      size,
    };

    // Remove existing entry if it exists
    const existing = this.memoryCache.get(key);
    if (existing) {
      this.stats.size -= existing.size;
    }

    this.memoryCache.set(key, entry);
    this.stats.size += size;
    this.stats.entries = this.memoryCache.size;

    logger.debug(`Cache set: ${key}`, { size, tags, ttl });
  }

  get<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.memoryCache.delete(key);
      this.stats.size -= entry.size;
      this.stats.entries = this.memoryCache.size;
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    entry.hits++;
    this.stats.hits++;
    this.updateHitRate();

    return this.decompress(entry.data);
  }

  has(key: string): boolean {
    const entry = this.memoryCache.get(key);
    if (!entry) return false;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.memoryCache.delete(key);
      this.stats.size -= entry.size;
      this.stats.entries = this.memoryCache.size;
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    const entry = this.memoryCache.get(key);
    if (entry) {
      this.memoryCache.delete(key);
      this.stats.size -= entry.size;
      this.stats.entries = this.memoryCache.size;
      logger.debug(`Cache delete: ${key}`);
      return true;
    }
    return false;
  }

  invalidateByTag(tag: string): number {
    let invalidated = 0;
    
    for (const [key, entry] of this.memoryCache) {
      if (entry.tags.includes(tag)) {
        this.memoryCache.delete(key);
        this.stats.size -= entry.size;
        invalidated++;
      }
    }

    this.stats.entries = this.memoryCache.size;
    
    if (invalidated > 0) {
      logger.debug(`Cache invalidated by tag: ${tag}`, { invalidated });
    }

    return invalidated;
  }

  invalidateByPattern(pattern: RegExp): number {
    let invalidated = 0;
    
    for (const key of this.memoryCache.keys()) {
      if (pattern.test(key)) {
        const entry = this.memoryCache.get(key)!;
        this.memoryCache.delete(key);
        this.stats.size -= entry.size;
        invalidated++;
      }
    }

    this.stats.entries = this.memoryCache.size;
    
    if (invalidated > 0) {
      logger.debug(`Cache invalidated by pattern: ${pattern}`, { invalidated });
    }

    return invalidated;
  }

  clear(): void {
    this.memoryCache.clear();
    this.stats.entries = 0;
    this.stats.size = 0;
    logger.debug('Cache cleared');
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }
}

// Global cache instance
export const globalCache = new AdvancedCache({
  maxSize: 50 * 1024 * 1024, // 50MB
  maxEntries: 10000,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  cleanupInterval: 60 * 1000, // 1 minute
  compressionThreshold: 100 * 1024, // 100KB
});

/**
 * React Query cache enhancement
 */
export function useEnhancedCache() {
  const queryClient = useQueryClient();

  const setQueryCache = useCallback(<T>(
    queryKey: string[],
    data: T,
    ttl?: number,
    tags?: string[]
  ) => {
    const key = queryKey.join(':');
    globalCache.set(key, data, ttl, tags);
    
    // Also set in React Query cache
    queryClient.setQueryData(queryKey, data);
  }, [queryClient]);

  const getQueryCache = useCallback(<T>(queryKey: string[]): T | null => {
    const key = queryKey.join(':');
    return globalCache.get<T>(key);
  }, []);

  const invalidateCache = useCallback((
    queryKey?: string[],
    tag?: string,
    pattern?: RegExp
  ) => {
    if (queryKey) {
      const key = queryKey.join(':');
      globalCache.delete(key);
      queryClient.invalidateQueries({ queryKey });
    } else if (tag) {
      globalCache.invalidateByTag(tag);
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey.join(':');
          const entry = globalCache.memoryCache.get(key);
          return entry?.tags.includes(tag) || false;
        },
      });
    } else if (pattern) {
      globalCache.invalidateByPattern(pattern);
      queryClient.invalidateQueries({
        predicate: (query) => pattern.test(query.queryKey.join(':')),
      });
    }
  }, [queryClient]);

  return {
    setQueryCache,
    getQueryCache,
    invalidateCache,
    getCacheStats: () => globalCache.getStats(),
  };
}

/**
 * Persistent cache using IndexedDB
 */
export class PersistentCache {
  private dbName = 'evo-cache';
  private version = 1;
  private db?: IDBDatabase;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('cache')) {
          const store = db.createObjectStore('cache', { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('tags', 'tags', { multiEntry: true });
        }
      };
    });
  }

  async set<T>(key: string, data: T, ttl: number, tags: string[] = []): Promise<void> {
    if (!this.db) await this.init();

    const transaction = this.db!.transaction(['cache'], 'readwrite');
    const store = transaction.objectStore('cache');
    
    const entry = {
      key,
      data,
      timestamp: Date.now(),
      ttl,
      tags,
    };

    return new Promise((resolve, reject) => {
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.db) await this.init();

    const transaction = this.db!.transaction(['cache'], 'readonly');
    const store = transaction.objectStore('cache');

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      
      request.onsuccess = () => {
        const entry = request.result;
        
        if (!entry) {
          resolve(null);
          return;
        }

        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
          // Entry expired, delete it
          this.delete(key);
          resolve(null);
          return;
        }

        resolve(entry.data);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async delete(key: string): Promise<void> {
    if (!this.db) await this.init();

    const transaction = this.db!.transaction(['cache'], 'readwrite');
    const store = transaction.objectStore('cache');

    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();

    const transaction = this.db!.transaction(['cache'], 'readwrite');
    const store = transaction.objectStore('cache');

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Global persistent cache instance
export const persistentCache = new PersistentCache();

/**
 * Cache warming utilities
 */
export class CacheWarmer {
  private warmingQueue: Array<() => Promise<void>> = [];
  private isWarming = false;

  addWarmupTask(task: () => Promise<void>): void {
    this.warmingQueue.push(task);
  }

  async warmCache(): Promise<void> {
    if (this.isWarming) return;
    
    this.isWarming = true;
    logger.info('Starting cache warmup', { tasks: this.warmingQueue.length });

    try {
      for (const task of this.warmingQueue) {
        try {
          await task();
        } catch (error) {
          logger.warn('Cache warmup task failed', error as Error);
        }
      }
    } finally {
      this.isWarming = false;
      logger.info('Cache warmup completed');
    }
  }

  clear(): void {
    this.warmingQueue = [];
  }
}

export const cacheWarmer = new CacheWarmer();

/**
 * Cache preloading hook
 */
export function useCachePreloader() {
  const { setQueryCache } = useEnhancedCache();

  const preloadData = useCallback(async (
    queryKey: string[],
    dataFetcher: () => Promise<any>,
    ttl?: number,
    tags?: string[]
  ) => {
    try {
      const data = await dataFetcher();
      setQueryCache(queryKey, data, ttl, tags);
      logger.debug('Data preloaded', { queryKey });
    } catch (error) {
      logger.warn('Failed to preload data', error as Error, { queryKey });
    }
  }, [setQueryCache]);

  return { preloadData };
}

/**
 * Cache monitoring hook
 */
export function useCacheMonitor() {
  const [stats, setStats] = useState<CacheStats>(globalCache.getStats());
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setStats(globalCache.getStats());
    }, 5000); // Update every 5 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return stats;
}