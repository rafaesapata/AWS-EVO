/**
 * Redis Cache Implementation
 * High-performance distributed caching system
 */

import Redis, { RedisOptions } from 'ioredis';
import { logger } from './logging';
import { metricsCollector } from './metrics-collector';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
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
 */
export class RedisCacheManager {
  private redis: Redis;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    hitRate: 0
  };
  private defaultTTL = 3600; // 1 hour
  private keyPrefix = 'evo-uds:';

  constructor(options?: RedisOptions) {
    const redisConfig: RedisOptions = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      
      // Connection settings
      connectTimeout: 10000,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      
      // Performance settings
      enableReadyCheck: false,
      
      // Cluster support
      enableOfflineQueue: false,
      
      ...options
    };

    this.redis = new Redis(redisConfig);

    // Event handlers
    this.redis.on('connect', () => {
      logger.info('Redis connected');
    });

    this.redis.on('ready', () => {
      logger.info('Redis ready');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis error', error);
      this.stats.errors++;
      metricsCollector.recordCounter('redis_error', 1);
    });

    this.redis.on('close', () => {
      logger.warn('Redis connection closed');
    });

    this.redis.on('reconnecting', () => {
      logger.info('Redis reconnecting');
    });

    // Start stats reporting
    this.startStatsReporting();
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string, options: CacheOptions = {}): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const startTime = Date.now();
      
      const value = await this.redis.get(fullKey);
      
      const duration = Date.now() - startTime;
      metricsCollector.recordTimer('redis_get_duration', duration);

      if (value === null) {
        this.stats.misses++;
        metricsCollector.recordCounter('redis_cache_miss', 1, { key: fullKey });
        return null;
      }

      this.stats.hits++;
      metricsCollector.recordCounter('redis_cache_hit', 1, { key: fullKey });

      // Deserialize if needed
      if (options.serialize !== false) {
        try {
          return JSON.parse(value);
        } catch (error) {
          logger.warn('Failed to parse cached value', { key: fullKey, error });
          return value as T;
        }
      }

      return value as T;
    } catch (error) {
      logger.error('Redis get error', error as Error, { key });
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(
    key: string, 
    value: any, 
    options: CacheOptions = {}
  ): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const ttl = options.ttl || this.defaultTTL;
      const startTime = Date.now();

      let serializedValue: string;
      
      // Serialize if needed
      if (options.serialize !== false && typeof value !== 'string') {
        serializedValue = JSON.stringify(value);
      } else {
        serializedValue = String(value);
      }

      // Compress if needed (implement compression logic here)
      if (options.compress && serializedValue.length > 1024) {
        // Could implement gzip compression here
        // serializedValue = await compress(serializedValue);
      }

      const result = await this.redis.setex(fullKey, ttl, serializedValue);
      
      const duration = Date.now() - startTime;
      metricsCollector.recordTimer('redis_set_duration', duration);

      if (result === 'OK') {
        this.stats.sets++;
        metricsCollector.recordCounter('redis_cache_set', 1, { 
          key: fullKey,
          size: serializedValue.length.toString() 
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Redis set error', error as Error, { key });
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key: string, options: CacheOptions = {}): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const result = await this.redis.del(fullKey);
      
      if (result > 0) {
        this.stats.deletes++;
        metricsCollector.recordCounter('redis_cache_delete', 1, { key: fullKey });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Redis delete error', error as Error, { key });
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string, options: CacheOptions = {}): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      logger.error('Redis exists error', error as Error, { key });
      return false;
    }
  }

  /**
   * Get multiple keys
   */
  async mget<T = any>(keys: string[], options: CacheOptions = {}): Promise<(T | null)[]> {
    try {
      const fullKeys = keys.map(key => this.buildKey(key, options.prefix));
      const values = await this.redis.mget(...fullKeys);
      
      return values.map((value, index) => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }

        this.stats.hits++;
        
        if (options.serialize !== false) {
          try {
            return JSON.parse(value);
          } catch (error) {
            logger.warn('Failed to parse cached value', { key: fullKeys[index], error });
            return value as T;
          }
        }

        return value as T;
      });
    } catch (error) {
      logger.error('Redis mget error', error as Error, { keys });
      this.stats.errors++;
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys
   */
  async mset(
    keyValuePairs: Array<[string, any]>, 
    options: CacheOptions = {}
  ): Promise<boolean> {
    try {
      const ttl = options.ttl || this.defaultTTL;
      const pipeline = this.redis.pipeline();

      for (const [key, value] of keyValuePairs) {
        const fullKey = this.buildKey(key, options.prefix);
        let serializedValue: string;
        
        if (options.serialize !== false && typeof value !== 'string') {
          serializedValue = JSON.stringify(value);
        } else {
          serializedValue = String(value);
        }

        pipeline.setex(fullKey, ttl, serializedValue);
      }

      const results = await pipeline.exec();
      const success = results?.every(([error, result]) => error === null && result === 'OK') ?? false;

      if (success) {
        this.stats.sets += keyValuePairs.length;
      }

      return success;
    } catch (error) {
      logger.error('Redis mset error', error as Error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Increment counter
   */
  async increment(key: string, by: number = 1, options: CacheOptions = {}): Promise<number> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const result = await this.redis.incrby(fullKey, by);
      
      // Set TTL if this is a new key
      if (result === by) {
        const ttl = options.ttl || this.defaultTTL;
        await this.redis.expire(fullKey, ttl);
      }

      return result;
    } catch (error) {
      logger.error('Redis increment error', error as Error, { key });
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Add to set
   */
  async sadd(key: string, members: string[], options: CacheOptions = {}): Promise<number> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const result = await this.redis.sadd(fullKey, ...members);
      
      if (options.ttl) {
        await this.redis.expire(fullKey, options.ttl);
      }

      return result;
    } catch (error) {
      logger.error('Redis sadd error', error as Error, { key });
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Get set members
   */
  async smembers(key: string, options: CacheOptions = {}): Promise<string[]> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      return await this.redis.smembers(fullKey);
    } catch (error) {
      logger.error('Redis smembers error', error as Error, { key });
      this.stats.errors++;
      return [];
    }
  }

  /**
   * Remove from set
   */
  async srem(key: string, members: string[], options: CacheOptions = {}): Promise<number> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      return await this.redis.srem(fullKey, ...members);
    } catch (error) {
      logger.error('Redis srem error', error as Error, { key });
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Get keys by pattern
   */
  async keys(pattern: string, options: CacheOptions = {}): Promise<string[]> {
    try {
      const fullPattern = this.buildKey(pattern, options.prefix);
      return await this.redis.keys(fullPattern);
    } catch (error) {
      logger.error('Redis keys error', error as Error, { pattern });
      this.stats.errors++;
      return [];
    }
  }

  /**
   * Delete keys by pattern
   */
  async deletePattern(pattern: string, options: CacheOptions = {}): Promise<number> {
    try {
      const keys = await this.keys(pattern, options);
      if (keys.length === 0) return 0;

      const result = await this.redis.del(...keys);
      this.stats.deletes += result;
      return result;
    } catch (error) {
      logger.error('Redis delete pattern error', error as Error, { pattern });
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0
    };
  }

  /**
   * Clear all cache statistics
   */
  clearStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      hitRate: 0
    };
  }

  /**
   * Flush all cache
   */
  async flush(): Promise<boolean> {
    try {
      await this.redis.flushdb();
      logger.info('Redis cache flushed');
      return true;
    } catch (error) {
      logger.error('Redis flush error', error as Error);
      return false;
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Build full cache key
   */
  private buildKey(key: string, prefix?: string): string {
    const fullPrefix = prefix ? `${this.keyPrefix}${prefix}:` : this.keyPrefix;
    return `${fullPrefix}${key}`;
  }

  /**
   * Start periodic stats reporting
   */
  private startStatsReporting(): void {
    setInterval(() => {
      const stats = this.getStats();
      
      metricsCollector.recordPercent('redis_cache_hit_rate', stats.hitRate);
      metricsCollector.recordCounter('redis_cache_hits_total', stats.hits);
      metricsCollector.recordCounter('redis_cache_misses_total', stats.misses);
      metricsCollector.recordCounter('redis_cache_sets_total', stats.sets);
      metricsCollector.recordCounter('redis_cache_deletes_total', stats.deletes);
      metricsCollector.recordCounter('redis_cache_errors_total', stats.errors);

      logger.debug('Redis cache stats', stats);
    }, 60000); // Every minute
  }
}

// Cache decorators for easy usage
export function cached(
  keyGenerator: (...args: any[]) => string,
  options: CacheOptions = {}
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = keyGenerator(...args);
      
      // Try to get from cache first
      const cached = await cacheManager.get(cacheKey, options);
      if (cached !== null) {
        return cached;
      }

      // Execute original method
      const result = await method.apply(this, args);
      
      // Cache the result
      await cacheManager.set(cacheKey, result, options);
      
      return result;
    };
  };
}

// Cache invalidation decorator
export function invalidateCache(
  keyPatterns: string[] | ((...args: any[]) => string[])
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await method.apply(this, args);
      
      // Invalidate cache keys
      const patterns = typeof keyPatterns === 'function' 
        ? keyPatterns(...args) 
        : keyPatterns;

      for (const pattern of patterns) {
        await cacheManager.deletePattern(pattern);
      }
      
      return result;
    };
  };
}

// Specialized cache managers for different data types
export class SecurityCacheManager {
  private cache: RedisCacheManager;
  private prefix = 'security';

  constructor(cache: RedisCacheManager) {
    this.cache = cache;
  }

  async cacheFindings(orgId: string, findings: any[], ttl: number = 300): Promise<void> {
    await this.cache.set(`findings:${orgId}`, findings, { 
      prefix: this.prefix, 
      ttl 
    });
  }

  async getFindings(orgId: string): Promise<any[] | null> {
    return this.cache.get(`findings:${orgId}`, { prefix: this.prefix });
  }

  async cacheScanResult(scanId: string, result: any, ttl: number = 3600): Promise<void> {
    await this.cache.set(`scan:${scanId}`, result, { 
      prefix: this.prefix, 
      ttl 
    });
  }

  async getScanResult(scanId: string): Promise<any | null> {
    return this.cache.get(`scan:${scanId}`, { prefix: this.prefix });
  }

  async invalidateOrgCache(orgId: string): Promise<void> {
    await this.cache.deletePattern(`*:${orgId}`, { prefix: this.prefix });
  }
}

export class CostCacheManager {
  private cache: RedisCacheManager;
  private prefix = 'cost';

  constructor(cache: RedisCacheManager) {
    this.cache = cache;
  }

  async cacheCostData(accountId: string, period: string, data: any, ttl: number = 1800): Promise<void> {
    await this.cache.set(`data:${accountId}:${period}`, data, { 
      prefix: this.prefix, 
      ttl 
    });
  }

  async getCostData(accountId: string, period: string): Promise<any | null> {
    return this.cache.get(`data:${accountId}:${period}`, { prefix: this.prefix });
  }

  async cacheOptimizationRecommendations(accountId: string, recommendations: any[], ttl: number = 3600): Promise<void> {
    await this.cache.set(`optimization:${accountId}`, recommendations, { 
      prefix: this.prefix, 
      ttl 
    });
  }

  async getOptimizationRecommendations(accountId: string): Promise<any[] | null> {
    return this.cache.get(`optimization:${accountId}`, { prefix: this.prefix });
  }
}

// Global cache manager instance
export const cacheManager = new RedisCacheManager();
export const securityCache = new SecurityCacheManager(cacheManager);
export const costCache = new CostCacheManager(cacheManager);

// Health check for Redis
export async function checkRedisHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  latency?: number;
  error?: string;
}> {
  try {
    const start = Date.now();
    await cacheManager.set('health-check', 'ok', { ttl: 10 });
    const result = await cacheManager.get('health-check');
    const latency = Date.now() - start;
    
    if (result === 'ok') {
      await cacheManager.delete('health-check');
      return { status: 'healthy', latency };
    } else {
      return { status: 'unhealthy', error: 'Health check value mismatch' };
    }
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}