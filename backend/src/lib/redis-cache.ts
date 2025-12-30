/**
 * Redis Cache Implementation
 * High-performance distributed caching system
 * 
 * NOTA: Usa cache em memória (não depende de ioredis)
 * Para usar Redis real, adicionar ioredis ao Lambda layer
 */

import { logger } from './logging.js';

// In-memory cache fallback
const memoryCache = new Map<string, { value: any; expiry: number }>();

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
 * Usa cache em memória por padrão (funciona em Lambda sem dependências extras)
 */
export class RedisCacheManager {
  private redis: any = null;
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
  private useMemoryFallback = true; // Sempre usar memória por padrão

  constructor(options?: any) {
    // Sempre usar cache em memória (mais simples e funciona em Lambda)
    logger.info('Using in-memory cache');
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string, options: CacheOptions = {}): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      
      const cached = memoryCache.get(fullKey);
      if (!cached || cached.expiry < Date.now()) {
        if (cached) memoryCache.delete(fullKey);
        this.stats.misses++;
        return null;
      }
      this.stats.hits++;
      return cached.value as T;
    } catch (error) {
      logger.error('Cache get error', error as Error, { key });
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

      memoryCache.set(fullKey, {
        value: value,
        expiry: Date.now() + (ttl * 1000)
      });
      this.stats.sets++;
      return true;
    } catch (error) {
      logger.error('Cache set error', error as Error, { key });
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
      
      const existed = memoryCache.has(fullKey);
      memoryCache.delete(fullKey);
      if (existed) this.stats.deletes++;
      return existed;
    } catch (error) {
      logger.error('Cache delete error', error as Error, { key });
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
      
      const cached = memoryCache.get(fullKey);
      if (!cached || cached.expiry < Date.now()) {
        if (cached) memoryCache.delete(fullKey);
        return false;
      }
      return true;
    } catch (error) {
      logger.error('Cache exists error', error as Error, { key });
      return false;
    }
  }

  /**
   * Get multiple keys
   */
  async mget<T = any>(keys: string[], options: CacheOptions = {}): Promise<(T | null)[]> {
    try {
      const fullKeys = keys.map(key => this.buildKey(key, options.prefix));
      
      return fullKeys.map(fullKey => {
        const cached = memoryCache.get(fullKey);
        if (!cached || cached.expiry < Date.now()) {
          if (cached) memoryCache.delete(fullKey);
          this.stats.misses++;
          return null;
        }
        this.stats.hits++;
        return cached.value as T;
      });
    } catch (error) {
      logger.error('Cache mget error', error as Error, { keys });
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
      
      const expiry = Date.now() + (ttl * 1000);
      for (const [key, value] of keyValuePairs) {
        const fullKey = this.buildKey(key, options.prefix);
        memoryCache.set(fullKey, { value, expiry });
      }
      this.stats.sets += keyValuePairs.length;
      return true;
    } catch (error) {
      logger.error('Cache mset error', error as Error);
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
      
      const cached = memoryCache.get(fullKey);
      const currentValue = cached && cached.expiry > Date.now() ? (cached.value as number) : 0;
      const newValue = currentValue + by;
      const ttl = options.ttl || this.defaultTTL;
      memoryCache.set(fullKey, { value: newValue, expiry: Date.now() + (ttl * 1000) });
      return newValue;
    } catch (error) {
      logger.error('Cache increment error', error as Error, { key });
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
      
      const cached = memoryCache.get(fullKey);
      const currentSet = cached && cached.expiry > Date.now() ? new Set(cached.value as string[]) : new Set<string>();
      let added = 0;
      for (const member of members) {
        if (!currentSet.has(member)) {
          currentSet.add(member);
          added++;
        }
      }
      const ttl = options.ttl || this.defaultTTL;
      memoryCache.set(fullKey, { value: Array.from(currentSet), expiry: Date.now() + (ttl * 1000) });
      return added;
    } catch (error) {
      logger.error('Cache sadd error', error as Error, { key });
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
      
      const cached = memoryCache.get(fullKey);
      if (!cached || cached.expiry < Date.now()) {
        if (cached) memoryCache.delete(fullKey);
        return [];
      }
      return cached.value as string[];
    } catch (error) {
      logger.error('Cache smembers error', error as Error, { key });
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
      
      const cached = memoryCache.get(fullKey);
      if (!cached || cached.expiry < Date.now()) {
        if (cached) memoryCache.delete(fullKey);
        return 0;
      }
      const currentSet = new Set(cached.value as string[]);
      let removed = 0;
      for (const member of members) {
        if (currentSet.delete(member)) removed++;
      }
      memoryCache.set(fullKey, { value: Array.from(currentSet), expiry: cached.expiry });
      return removed;
    } catch (error) {
      logger.error('Cache srem error', error as Error, { key });
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
      
      const now = Date.now();
      const matchingKeys: string[] = [];
      const regexPattern = fullPattern.replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      
      for (const [key, cached] of memoryCache.entries()) {
        if (cached.expiry < now) {
          memoryCache.delete(key);
          continue;
        }
        if (regex.test(key)) {
          matchingKeys.push(key);
        }
      }
      return matchingKeys;
    } catch (error) {
      logger.error('Cache keys error', error as Error, { pattern });
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

      for (const key of keys) {
        memoryCache.delete(key);
      }
      this.stats.deletes += keys.length;
      return keys.length;
    } catch (error) {
      logger.error('Cache delete pattern error', error as Error, { pattern });
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
      memoryCache.clear();
      logger.info('Memory cache flushed');
      return true;
    } catch (error) {
      logger.error('Cache flush error', error as Error);
      return false;
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    // No-op for memory cache
  }

  /**
   * Build full cache key
   */
  private buildKey(key: string, prefix?: string): string {
    const fullPrefix = prefix ? `${this.keyPrefix}${prefix}:` : this.keyPrefix;
    return `${fullPrefix}${key}`;
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

/**
 * Metrics Cache Manager
 * Specialized cache for CloudWatch metrics with intelligent TTL and period-based caching
 */
export class MetricsCacheManager {
  private cache: RedisCacheManager;
  private prefix = 'metrics';

  // TTL por período de métricas (em segundos)
  private readonly PERIOD_TTL: Record<string, number> = {
    '3h': 5 * 60,      // 5 minutos para dados de 3 horas
    '24h': 15 * 60,    // 15 minutos para dados de 24 horas
    '7d': 60 * 60,     // 1 hora para dados de 7 dias
    'default': 5 * 60, // 5 minutos padrão
  };

  constructor(cache: RedisCacheManager) {
    this.cache = cache;
  }

  /**
   * Gera chave de cache para métricas
   */
  private buildMetricsKey(accountId: string, resourceType?: string, period?: string): string {
    const parts = ['account', accountId];
    if (resourceType) parts.push('type', resourceType);
    if (period) parts.push('period', period);
    return parts.join(':');
  }

  /**
   * Cache de métricas por conta e período
   */
  async cacheMetrics(
    accountId: string,
    metrics: any[],
    period: string = 'default'
  ): Promise<boolean> {
    const key = this.buildMetricsKey(accountId, undefined, period);
    const ttl = this.PERIOD_TTL[period] || this.PERIOD_TTL['default'];
    
    logger.info(`[MetricsCache] Caching ${metrics.length} metrics for account ${accountId}, period ${period}, TTL ${ttl}s`);
    
    return this.cache.set(key, {
      metrics,
      cachedAt: Date.now(),
      period,
      count: metrics.length,
    }, { 
      prefix: this.prefix, 
      ttl 
    });
  }

  /**
   * Buscar métricas do cache
   */
  async getMetrics(
    accountId: string,
    period: string = 'default'
  ): Promise<{ metrics: any[]; cachedAt: number; fromCache: boolean } | null> {
    const key = this.buildMetricsKey(accountId, undefined, period);
    const cached = await this.cache.get<{ metrics: any[]; cachedAt: number; period: string; count: number }>(key, { prefix: this.prefix });
    
    if (cached) {
      const cacheAge = Math.round((Date.now() - cached.cachedAt) / 1000);
      logger.info(`[MetricsCache] Cache HIT for account ${accountId}, period ${period}, age ${cacheAge}s, ${cached.count} metrics`);
      return {
        metrics: cached.metrics,
        cachedAt: cached.cachedAt,
        fromCache: true,
      };
    }
    
    logger.info(`[MetricsCache] Cache MISS for account ${accountId}, period ${period}`);
    return null;
  }

  /**
   * Cache de recursos descobertos
   */
  async cacheResources(
    accountId: string,
    resources: any[],
    ttl: number = 300 // 5 minutos
  ): Promise<boolean> {
    const key = `resources:${accountId}`;
    
    logger.info(`[MetricsCache] Caching ${resources.length} resources for account ${accountId}`);
    
    return this.cache.set(key, {
      resources,
      cachedAt: Date.now(),
      count: resources.length,
    }, { 
      prefix: this.prefix, 
      ttl 
    });
  }

  /**
   * Buscar recursos do cache
   */
  async getResources(accountId: string): Promise<{ resources: any[]; cachedAt: number; fromCache: boolean } | null> {
    const key = `resources:${accountId}`;
    const cached = await this.cache.get<{ resources: any[]; cachedAt: number; count: number }>(key, { prefix: this.prefix });
    
    if (cached) {
      const cacheAge = Math.round((Date.now() - cached.cachedAt) / 1000);
      logger.info(`[MetricsCache] Resources cache HIT for account ${accountId}, age ${cacheAge}s, ${cached.count} resources`);
      return {
        resources: cached.resources,
        cachedAt: cached.cachedAt,
        fromCache: true,
      };
    }
    
    logger.info(`[MetricsCache] Resources cache MISS for account ${accountId}`);
    return null;
  }

  /**
   * Cache de resultado completo de coleta (recursos + métricas)
   */
  async cacheCollectionResult(
    accountId: string,
    result: {
      resources: any[];
      metrics: any[];
      regionsScanned: string[];
      permissionErrors?: any[];
    },
    ttl: number = 300
  ): Promise<boolean> {
    const key = `collection:${accountId}`;
    
    return this.cache.set(key, {
      ...result,
      cachedAt: Date.now(),
      resourceCount: result.resources.length,
      metricCount: result.metrics.length,
    }, { 
      prefix: this.prefix, 
      ttl 
    });
  }

  /**
   * Buscar resultado de coleta do cache
   */
  async getCollectionResult(accountId: string): Promise<{
    resources: any[];
    metrics: any[];
    regionsScanned: string[];
    permissionErrors?: any[];
    cachedAt: number;
    fromCache: boolean;
  } | null> {
    const key = `collection:${accountId}`;
    const cached = await this.cache.get<any>(key, { prefix: this.prefix });
    
    if (cached) {
      const cacheAge = Math.round((Date.now() - cached.cachedAt) / 1000);
      logger.info(`[MetricsCache] Collection cache HIT for account ${accountId}, age ${cacheAge}s`);
      return {
        ...cached,
        fromCache: true,
      };
    }
    
    return null;
  }

  /**
   * Invalidar cache de uma conta
   */
  async invalidateAccount(accountId: string): Promise<number> {
    logger.info(`[MetricsCache] Invalidating all cache for account ${accountId}`);
    return this.cache.deletePattern(`*${accountId}*`, { prefix: this.prefix });
  }

  /**
   * Invalidar todo o cache de métricas
   */
  async invalidateAll(): Promise<number> {
    logger.info(`[MetricsCache] Invalidating all metrics cache`);
    return this.cache.deletePattern('*', { prefix: this.prefix });
  }

  /**
   * Verificar se cache existe e é válido
   */
  async isCacheValid(accountId: string, maxAgeSeconds: number = 300): Promise<boolean> {
    const key = `collection:${accountId}`;
    const cached = await this.cache.get<{ cachedAt: number }>(key, { prefix: this.prefix });
    
    if (!cached) return false;
    
    const cacheAge = (Date.now() - cached.cachedAt) / 1000;
    return cacheAge < maxAgeSeconds;
  }

  /**
   * Obter estatísticas do cache de métricas
   */
  async getCacheInfo(accountId: string): Promise<{
    hasCache: boolean;
    cacheAge?: number;
    resourceCount?: number;
    metricCount?: number;
  }> {
    const key = `collection:${accountId}`;
    const cached = await this.cache.get<any>(key, { prefix: this.prefix });
    
    if (!cached) {
      return { hasCache: false };
    }
    
    return {
      hasCache: true,
      cacheAge: Math.round((Date.now() - cached.cachedAt) / 1000),
      resourceCount: cached.resourceCount,
      metricCount: cached.metricCount,
    };
  }
}

/**
 * Edge Services Cache Manager
 * Specialized cache for CloudFront, WAF, and Load Balancer edge services
 */
export class EdgeCacheManager {
  private cache: RedisCacheManager;
  private prefix = 'edge';

  // TTL por período (em segundos)
  private readonly PERIOD_TTL: Record<string, number> = {
    '1h': 5 * 60,      // 5 minutos para dados de 1 hora
    '24h': 15 * 60,    // 15 minutos para dados de 24 horas
    '7d': 60 * 60,     // 1 hora para dados de 7 dias
    'default': 5 * 60, // 5 minutos padrão
  };

  constructor(cache: RedisCacheManager) {
    this.cache = cache;
  }

  /**
   * Cache de serviços de borda descobertos
   */
  async cacheEdgeServices(
    accountId: string,
    services: any[],
    ttl: number = 300
  ): Promise<boolean> {
    const key = `services:${accountId}`;
    
    logger.info(`[EdgeCache] Caching ${services.length} edge services for account ${accountId}`);
    
    return this.cache.set(key, {
      services,
      cachedAt: Date.now(),
      count: services.length,
    }, { 
      prefix: this.prefix, 
      ttl 
    });
  }

  /**
   * Buscar serviços de borda do cache
   */
  async getEdgeServices(accountId: string): Promise<{ services: any[]; cachedAt: number; fromCache: boolean } | null> {
    const key = `services:${accountId}`;
    const cached = await this.cache.get<{ services: any[]; cachedAt: number; count: number }>(key, { prefix: this.prefix });
    
    if (cached) {
      const cacheAge = Math.round((Date.now() - cached.cachedAt) / 1000);
      logger.info(`[EdgeCache] Services cache HIT for account ${accountId}, age ${cacheAge}s, ${cached.count} services`);
      return {
        services: cached.services,
        cachedAt: cached.cachedAt,
        fromCache: true,
      };
    }
    
    logger.info(`[EdgeCache] Services cache MISS for account ${accountId}`);
    return null;
  }

  /**
   * Cache de métricas de borda
   */
  async cacheEdgeMetrics(
    accountId: string,
    metrics: any[],
    period: string = 'default'
  ): Promise<boolean> {
    const key = `metrics:${accountId}:${period}`;
    const ttl = this.PERIOD_TTL[period] || this.PERIOD_TTL['default'];
    
    logger.info(`[EdgeCache] Caching ${metrics.length} edge metrics for account ${accountId}, period ${period}, TTL ${ttl}s`);
    
    return this.cache.set(key, {
      metrics,
      cachedAt: Date.now(),
      period,
      count: metrics.length,
    }, { 
      prefix: this.prefix, 
      ttl 
    });
  }

  /**
   * Buscar métricas de borda do cache
   */
  async getEdgeMetrics(
    accountId: string,
    period: string = 'default'
  ): Promise<{ metrics: any[]; cachedAt: number; fromCache: boolean } | null> {
    const key = `metrics:${accountId}:${period}`;
    const cached = await this.cache.get<{ metrics: any[]; cachedAt: number; period: string; count: number }>(key, { prefix: this.prefix });
    
    if (cached) {
      const cacheAge = Math.round((Date.now() - cached.cachedAt) / 1000);
      logger.info(`[EdgeCache] Metrics cache HIT for account ${accountId}, period ${period}, age ${cacheAge}s, ${cached.count} metrics`);
      return {
        metrics: cached.metrics,
        cachedAt: cached.cachedAt,
        fromCache: true,
      };
    }
    
    logger.info(`[EdgeCache] Metrics cache MISS for account ${accountId}, period ${period}`);
    return null;
  }

  /**
   * Cache de resultado completo de descoberta (serviços + métricas)
   */
  async cacheDiscoveryResult(
    accountId: string,
    result: {
      services: any[];
      metrics: any[];
      regionsScanned: string[];
      permissionErrors?: any[];
      breakdown?: {
        cloudfront: number;
        waf: number;
        loadBalancer: number;
      };
    },
    ttl: number = 300
  ): Promise<boolean> {
    const key = `discovery:${accountId}`;
    
    logger.info(`[EdgeCache] Caching discovery result for account ${accountId}, ${result.services.length} services, ${result.metrics.length} metrics`);
    
    return this.cache.set(key, {
      ...result,
      cachedAt: Date.now(),
      serviceCount: result.services.length,
      metricCount: result.metrics.length,
    }, { 
      prefix: this.prefix, 
      ttl 
    });
  }

  /**
   * Buscar resultado de descoberta do cache
   */
  async getDiscoveryResult(accountId: string): Promise<{
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
  } | null> {
    const key = `discovery:${accountId}`;
    const cached = await this.cache.get<any>(key, { prefix: this.prefix });
    
    if (cached) {
      const cacheAge = Math.round((Date.now() - cached.cachedAt) / 1000);
      logger.info(`[EdgeCache] Discovery cache HIT for account ${accountId}, age ${cacheAge}s`);
      return {
        ...cached,
        fromCache: true,
      };
    }
    
    logger.info(`[EdgeCache] Discovery cache MISS for account ${accountId}`);
    return null;
  }

  /**
   * Obter informações do cache
   */
  async getCacheInfo(accountId: string): Promise<{
    hasCache: boolean;
    cacheAge?: number;
    serviceCount?: number;
    metricCount?: number;
  }> {
    const key = `discovery:${accountId}`;
    const cached = await this.cache.get<any>(key, { prefix: this.prefix });
    
    if (!cached) {
      return { hasCache: false };
    }
    
    return {
      hasCache: true,
      cacheAge: Math.round((Date.now() - cached.cachedAt) / 1000),
      serviceCount: cached.serviceCount,
      metricCount: cached.metricCount,
    };
  }

  /**
   * Invalidar cache de uma conta
   */
  async invalidateAccount(accountId: string): Promise<number> {
    logger.info(`[EdgeCache] Invalidating all cache for account ${accountId}`);
    return this.cache.deletePattern(`*${accountId}*`, { prefix: this.prefix });
  }

  /**
   * Invalidar todo o cache de edge
   */
  async invalidateAll(): Promise<number> {
    logger.info(`[EdgeCache] Invalidating all edge cache`);
    return this.cache.deletePattern('*', { prefix: this.prefix });
  }

  /**
   * Verificar se cache existe e é válido
   */
  async isCacheValid(accountId: string, maxAgeSeconds: number = 300): Promise<boolean> {
    const key = `discovery:${accountId}`;
    const cached = await this.cache.get<{ cachedAt: number }>(key, { prefix: this.prefix });
    
    if (!cached) return false;
    
    const cacheAge = (Date.now() - cached.cachedAt) / 1000;
    return cacheAge < maxAgeSeconds;
  }
}

// Global cache manager instance
export const cacheManager = new RedisCacheManager();
export const securityCache = new SecurityCacheManager(cacheManager);
export const costCache = new CostCacheManager(cacheManager);
export const metricsCache = new MetricsCacheManager(cacheManager);
export const edgeCache = new EdgeCacheManager(cacheManager);

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