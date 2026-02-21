/**
 * Redis Cache Implementation
 * High-performance distributed caching backed by Amazon MemoryDB.
 * Falls back to in-memory Map when Redis is unavailable.
 * 
 * Architecture:
 *   MemoryDB (primary) → in-memory Map (fallback)
 *   All operations are fire-and-forget safe — errors never propagate to callers.
 */

import { getRedisClient, isRedisConnected } from './redis-client.js';
import { logger } from './logger.js';

// ============================================================================
// IN-MEMORY FALLBACK
// ============================================================================

const memoryCache = new Map<string, { value: string; expiry: number }>();
const MAX_MEMORY_ENTRIES = 5000;

function memoryGet(key: string): string | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiry < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key: string, value: string, ttlSeconds: number): void {
  // Evict oldest if full
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  memoryCache.set(key, { value, expiry: Date.now() + ttlSeconds * 1000 });
}

function memoryDel(key: string): boolean {
  return memoryCache.delete(key);
}

function memoryKeys(pattern: string): string[] {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  const now = Date.now();
  const result: string[] = [];
  for (const [k, v] of memoryCache.entries()) {
    if (v.expiry < now) { memoryCache.delete(k); continue; }
    if (regex.test(k)) result.push(k);
  }
  return result;
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface CacheOptions {
  ttl?: number;    // seconds
  prefix?: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRate: number;
  backend: 'redis' | 'memory';
}

// ============================================================================
// REDIS CACHE MANAGER
// ============================================================================

export class RedisCacheManager {
  private stats = { hits: 0, misses: 0, sets: 0, deletes: 0, errors: 0 };
  private defaultTTL = 3600; // 1 hour
  private keyPrefix = 'evo:';

  private buildKey(key: string, prefix?: string): string {
    return prefix ? `${this.keyPrefix}${prefix}:${key}` : `${this.keyPrefix}${key}`;
  }

  private serialize(value: any): string {
    return JSON.stringify(value);
  }

  private deserialize<T>(raw: string): T {
    return JSON.parse(raw) as T;
  }

  // --------------------------------------------------------------------------
  // CORE OPERATIONS
  // --------------------------------------------------------------------------

  async get<T = any>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const fullKey = this.buildKey(key, options.prefix);
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        const raw = await redis.get(fullKey);
        if (raw === null) { this.stats.misses++; return null; }
        this.stats.hits++;
        return this.deserialize<T>(raw);
      }
      // Fallback
      const raw = memoryGet(fullKey);
      if (raw === null) { this.stats.misses++; return null; }
      this.stats.hits++;
      return this.deserialize<T>(raw);
    } catch (err) {
      this.stats.errors++;
      logger.warn('[Cache] get error', { key: fullKey, error: (err as Error).message });
      // Try memory fallback on Redis error
      const raw = memoryGet(fullKey);
      if (raw) return this.deserialize<T>(raw);
      return null;
    }
  }

  async set(key: string, value: any, options: CacheOptions = {}): Promise<boolean> {
    const fullKey = this.buildKey(key, options.prefix);
    const ttl = options.ttl || this.defaultTTL;
    const serialized = this.serialize(value);
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        await redis.setex(fullKey, ttl, serialized);
        this.stats.sets++;
        return true;
      }
      // Fallback
      memorySet(fullKey, serialized, ttl);
      this.stats.sets++;
      return true;
    } catch (err) {
      this.stats.errors++;
      logger.warn('[Cache] set error', { key: fullKey, error: (err as Error).message });
      // Always write to memory as backup
      memorySet(fullKey, serialized, ttl);
      return true;
    }
  }

  async delete(key: string, options: CacheOptions = {}): Promise<boolean> {
    const fullKey = this.buildKey(key, options.prefix);
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        const count = await redis.del(fullKey);
        if (count > 0) this.stats.deletes++;
        memoryDel(fullKey); // also clean memory
        return count > 0;
      }
      const existed = memoryDel(fullKey);
      if (existed) this.stats.deletes++;
      return existed;
    } catch (err) {
      this.stats.errors++;
      logger.warn('[Cache] delete error', { key: fullKey, error: (err as Error).message });
      return memoryDel(fullKey);
    }
  }

  async exists(key: string, options: CacheOptions = {}): Promise<boolean> {
    const fullKey = this.buildKey(key, options.prefix);
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        return (await redis.exists(fullKey)) === 1;
      }
      return memoryGet(fullKey) !== null;
    } catch {
      return memoryGet(fullKey) !== null;
    }
  }

  async mget<T = any>(keys: string[], options: CacheOptions = {}): Promise<(T | null)[]> {
    const fullKeys = keys.map(k => this.buildKey(k, options.prefix));
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        const results = await redis.mget(...fullKeys);
        return results.map(raw => {
          if (raw === null) { this.stats.misses++; return null; }
          this.stats.hits++;
          return this.deserialize<T>(raw);
        });
      }
    } catch (err) {
      this.stats.errors++;
      logger.warn('[Cache] mget error', { error: (err as Error).message });
    }
    // Fallback
    return fullKeys.map(fk => {
      const raw = memoryGet(fk);
      if (raw === null) { this.stats.misses++; return null; }
      this.stats.hits++;
      return this.deserialize<T>(raw);
    });
  }

  async mset(pairs: Array<[string, any]>, options: CacheOptions = {}): Promise<boolean> {
    const ttl = options.ttl || this.defaultTTL;
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        const pipeline = redis.pipeline();
        for (const [key, value] of pairs) {
          const fullKey = this.buildKey(key, options.prefix);
          pipeline.setex(fullKey, ttl, this.serialize(value));
        }
        await pipeline.exec();
        this.stats.sets += pairs.length;
        return true;
      }
    } catch (err) {
      this.stats.errors++;
      logger.warn('[Cache] mset error', { error: (err as Error).message });
    }
    // Fallback
    for (const [key, value] of pairs) {
      const fullKey = this.buildKey(key, options.prefix);
      memorySet(fullKey, this.serialize(value), ttl);
    }
    this.stats.sets += pairs.length;
    return true;
  }

  async increment(key: string, by: number = 1, options: CacheOptions = {}): Promise<number> {
    const fullKey = this.buildKey(key, options.prefix);
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        const val = await redis.incrby(fullKey, by);
        if (options.ttl) await redis.expire(fullKey, options.ttl);
        return val;
      }
    } catch (err) {
      this.stats.errors++;
      logger.warn('[Cache] increment error', { key: fullKey, error: (err as Error).message });
    }
    // Fallback
    const raw = memoryGet(fullKey);
    const current = raw ? parseInt(raw, 10) : 0;
    const newVal = current + by;
    memorySet(fullKey, String(newVal), options.ttl || this.defaultTTL);
    return newVal;
  }

  async sadd(key: string, members: string[], options: CacheOptions = {}): Promise<number> {
    const fullKey = this.buildKey(key, options.prefix);
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        const added = await redis.sadd(fullKey, ...members);
        if (options.ttl) await redis.expire(fullKey, options.ttl);
        return added;
      }
    } catch (err) {
      this.stats.errors++;
      logger.warn('[Cache] sadd error', { key: fullKey, error: (err as Error).message });
    }
    // Fallback
    const raw = memoryGet(fullKey);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    let added = 0;
    for (const m of members) { if (!set.has(m)) { set.add(m); added++; } }
    memorySet(fullKey, JSON.stringify([...set]), options.ttl || this.defaultTTL);
    return added;
  }

  async smembers(key: string, options: CacheOptions = {}): Promise<string[]> {
    const fullKey = this.buildKey(key, options.prefix);
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        return await redis.smembers(fullKey);
      }
    } catch (err) {
      this.stats.errors++;
    }
    const raw = memoryGet(fullKey);
    return raw ? JSON.parse(raw) : [];
  }

  async srem(key: string, members: string[], options: CacheOptions = {}): Promise<number> {
    const fullKey = this.buildKey(key, options.prefix);
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        return await redis.srem(fullKey, ...members);
      }
    } catch (err) {
      this.stats.errors++;
    }
    const raw = memoryGet(fullKey);
    if (!raw) return 0;
    const set = new Set<string>(JSON.parse(raw));
    let removed = 0;
    for (const m of members) { if (set.delete(m)) removed++; }
    memorySet(fullKey, JSON.stringify([...set]), this.defaultTTL);
    return removed;
  }

  async keys(pattern: string, options: CacheOptions = {}): Promise<string[]> {
    const fullPattern = this.buildKey(pattern, options.prefix);
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        // Use SCAN instead of KEYS for production safety
        const result: string[] = [];
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', fullPattern, 'COUNT', 100);
          cursor = nextCursor;
          result.push(...keys);
        } while (cursor !== '0');
        return result;
      }
    } catch (err) {
      this.stats.errors++;
      logger.warn('[Cache] keys error', { pattern: fullPattern, error: (err as Error).message });
    }
    return memoryKeys(fullPattern);
  }

  async deletePattern(pattern: string, options: CacheOptions = {}): Promise<number> {
    const matchingKeys = await this.keys(pattern, options);
    if (matchingKeys.length === 0) return 0;
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        const count = await redis.del(...matchingKeys);
        this.stats.deletes += count;
        // Also clean memory
        for (const k of matchingKeys) memoryDel(k);
        return count;
      }
    } catch (err) {
      this.stats.errors++;
    }
    let count = 0;
    for (const k of matchingKeys) { if (memoryDel(k)) count++; }
    this.stats.deletes += count;
    return count;
  }

  // --------------------------------------------------------------------------
  // STALE-WHILE-REVALIDATE
  // --------------------------------------------------------------------------

  /**
   * Get cached data with stale-while-revalidate semantics.
   * - Always returns cached data if available (even if stale)
   * - Returns `{ data, stale }` where stale=true means data should be refreshed
   * - TTL is long (24h default) so data survives; freshFor controls staleness
   * 
   * Usage:
   *   const cached = await cacheManager.getSWR<MyType>('key', { prefix: 'dash' });
   *   if (cached && !cached.stale) return cached.data; // fresh hit
   *   const fresh = await fetchFromDB();
   *   await cacheManager.setSWR('key', fresh, { prefix: 'dash', freshFor: 300 });
   *   if (cached) return cached.data; // had stale data, return it (fresh saved for next)
   *   return fresh; // no cache at all, return fresh
   */
  async getSWR<T = any>(key: string, options: CacheOptions = {}): Promise<{ data: T; stale: boolean; age: number } | null> {
    const fullKey = this.buildKey(key, options.prefix);
    const metaKey = `${fullKey}:_swr`;
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        const [raw, meta] = await redis.mget(fullKey, metaKey);
        if (raw === null) { this.stats.misses++; return null; }
        this.stats.hits++;
        const refreshAfter = meta ? parseInt(meta, 10) : 0;
        const age = refreshAfter > 0 ? Math.max(0, Math.floor((Date.now() - refreshAfter) / 1000)) : 0;
        const stale = refreshAfter > 0 && Date.now() > refreshAfter;
        return { data: this.deserialize<T>(raw), stale, age: stale ? age : 0 };
      }
      // Fallback
      const raw = memoryGet(fullKey);
      if (raw === null) { this.stats.misses++; return null; }
      this.stats.hits++;
      const metaRaw = memoryGet(metaKey);
      const refreshAfter = metaRaw ? parseInt(metaRaw, 10) : 0;
      const stale = refreshAfter > 0 && Date.now() > refreshAfter;
      return { data: this.deserialize<T>(raw), stale, age: 0 };
    } catch (err) {
      this.stats.errors++;
      logger.warn('[Cache] getSWR error', { key: fullKey, error: (err as Error).message });
      const raw = memoryGet(fullKey);
      if (raw) return { data: this.deserialize<T>(raw), stale: true, age: 0 };
      return null;
    }
  }

  /**
   * Set data with stale-while-revalidate semantics.
   * @param freshFor - seconds until data is considered stale (default 300 = 5min)
   * @param maxTTL - max seconds to keep data in cache (default 86400 = 24h)
   */
  async setSWR(key: string, value: any, options: CacheOptions & { freshFor?: number; maxTTL?: number } = {}): Promise<boolean> {
    const fullKey = this.buildKey(key, options.prefix);
    const metaKey = `${fullKey}:_swr`;
    const maxTTL = options.maxTTL || 86400; // 24h
    const freshFor = options.freshFor || 300; // 5min
    const serialized = this.serialize(value);
    const refreshAfter = String(Date.now() + freshFor * 1000);
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        const pipeline = redis.pipeline();
        pipeline.setex(fullKey, maxTTL, serialized);
        pipeline.setex(metaKey, maxTTL, refreshAfter);
        await pipeline.exec();
        this.stats.sets++;
        return true;
      }
      memorySet(fullKey, serialized, maxTTL);
      memorySet(metaKey, refreshAfter, maxTTL);
      this.stats.sets++;
      return true;
    } catch (err) {
      this.stats.errors++;
      logger.warn('[Cache] setSWR error', { key: fullKey, error: (err as Error).message });
      memorySet(fullKey, serialized, maxTTL);
      memorySet(metaKey, refreshAfter, maxTTL);
      return true;
    }
  }

  // --------------------------------------------------------------------------
  // STATS & ADMIN
  // --------------------------------------------------------------------------

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const redis = getRedisClient();
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
      backend: redis ? 'redis' : 'memory',
    };
  }

  clearStats(): void {
    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, errors: 0 };
  }

  async flush(): Promise<boolean> {
    try {
      const redis = getRedisClient();
      if (redis && await isRedisConnected()) {
        // Only flush keys with our prefix using SCAN + DEL
        const allKeys = await this.keys('*');
        if (allKeys.length > 0) await redis.del(...allKeys);
      }
      memoryCache.clear();
      logger.info('[Cache] Flushed all cache');
      return true;
    } catch (err) {
      logger.warn('[Cache] flush error', { error: (err as Error).message });
      memoryCache.clear();
      return true;
    }
  }

  async close(): Promise<void> {
    // Handled by redis-client.ts closeRedisClient()
  }
}


// ============================================================================
// SPECIALIZED CACHE MANAGERS
// ============================================================================

export class SecurityCacheManager {
  private cache: RedisCacheManager;
  private prefix = 'security';

  constructor(cache: RedisCacheManager) { this.cache = cache; }

  async cacheFindings(orgId: string, findings: any[], ttl = 300): Promise<void> {
    await this.cache.set(`findings:${orgId}`, findings, { prefix: this.prefix, ttl });
  }
  async getFindings(orgId: string): Promise<any[] | null> {
    return this.cache.get(`findings:${orgId}`, { prefix: this.prefix });
  }
  async cacheScanResult(scanId: string, result: any, ttl = 3600): Promise<void> {
    await this.cache.set(`scan:${scanId}`, result, { prefix: this.prefix, ttl });
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

  constructor(cache: RedisCacheManager) { this.cache = cache; }

  async cacheCostData(accountId: string, period: string, data: any, ttl = 1800): Promise<void> {
    await this.cache.set(`data:${accountId}:${period}`, data, { prefix: this.prefix, ttl });
  }
  async getCostData(accountId: string, period: string): Promise<any | null> {
    return this.cache.get(`data:${accountId}:${period}`, { prefix: this.prefix });
  }
  async cacheOptimizationRecommendations(accountId: string, recs: any[], ttl = 3600): Promise<void> {
    await this.cache.set(`optimization:${accountId}`, recs, { prefix: this.prefix, ttl });
  }
  async getOptimizationRecommendations(accountId: string): Promise<any[] | null> {
    return this.cache.get(`optimization:${accountId}`, { prefix: this.prefix });
  }
}

export class MetricsCacheManager {
  private cache: RedisCacheManager;
  private prefix = 'metrics';
  private readonly PERIOD_TTL: Record<string, number> = {
    '3h': 300, '24h': 900, '7d': 3600, 'default': 300,
  };

  constructor(cache: RedisCacheManager) { this.cache = cache; }

  private buildMetricsKey(accountId: string, resourceType?: string, period?: string): string {
    const parts = ['account', accountId];
    if (resourceType) parts.push('type', resourceType);
    if (period) parts.push('period', period);
    return parts.join(':');
  }

  async cacheMetrics(accountId: string, metrics: any[], period = 'default'): Promise<boolean> {
    const key = this.buildMetricsKey(accountId, undefined, period);
    const ttl = this.PERIOD_TTL[period] || this.PERIOD_TTL['default'];
    return this.cache.set(key, { metrics, cachedAt: Date.now(), period, count: metrics.length }, { prefix: this.prefix, ttl });
  }

  async getMetrics(accountId: string, period = 'default'): Promise<{ metrics: any[]; cachedAt: number; fromCache: boolean } | null> {
    const key = this.buildMetricsKey(accountId, undefined, period);
    const cached = await this.cache.get<{ metrics: any[]; cachedAt: number }>(key, { prefix: this.prefix });
    if (!cached) return null;
    return { metrics: cached.metrics, cachedAt: cached.cachedAt, fromCache: true };
  }

  async cacheResources(accountId: string, resources: any[], ttl = 300): Promise<boolean> {
    return this.cache.set(`resources:${accountId}`, { resources, cachedAt: Date.now(), count: resources.length }, { prefix: this.prefix, ttl });
  }

  async getResources(accountId: string): Promise<{ resources: any[]; cachedAt: number; fromCache: boolean } | null> {
    const cached = await this.cache.get<{ resources: any[]; cachedAt: number }>(`resources:${accountId}`, { prefix: this.prefix });
    if (!cached) return null;
    return { resources: cached.resources, cachedAt: cached.cachedAt, fromCache: true };
  }

  async cacheCollectionResult(accountId: string, result: { resources: any[]; metrics: any[]; regionsScanned: string[]; permissionErrors?: any[] }, ttl = 300): Promise<boolean> {
    return this.cache.set(`collection:${accountId}`, { ...result, cachedAt: Date.now(), resourceCount: result.resources.length, metricCount: result.metrics.length }, { prefix: this.prefix, ttl });
  }

  async getCollectionResult(accountId: string): Promise<{ resources: any[]; metrics: any[]; regionsScanned: string[]; permissionErrors?: any[]; cachedAt: number; fromCache: boolean } | null> {
    const cached = await this.cache.get<any>(`collection:${accountId}`, { prefix: this.prefix });
    if (!cached) return null;
    return { ...cached, fromCache: true };
  }

  async invalidateAccount(accountId: string): Promise<number> {
    return this.cache.deletePattern(`*${accountId}*`, { prefix: this.prefix });
  }

  async invalidateAll(): Promise<number> {
    return this.cache.deletePattern('*', { prefix: this.prefix });
  }

  async isCacheValid(accountId: string, maxAgeSeconds = 300): Promise<boolean> {
    const cached = await this.cache.get<{ cachedAt: number }>(`collection:${accountId}`, { prefix: this.prefix });
    if (!cached) return false;
    return (Date.now() - cached.cachedAt) / 1000 < maxAgeSeconds;
  }

  async getCacheInfo(accountId: string): Promise<{ hasCache: boolean; cacheAge?: number; resourceCount?: number; metricCount?: number }> {
    const cached = await this.cache.get<any>(`collection:${accountId}`, { prefix: this.prefix });
    if (!cached) return { hasCache: false };
    return { hasCache: true, cacheAge: Math.round((Date.now() - cached.cachedAt) / 1000), resourceCount: cached.resourceCount, metricCount: cached.metricCount };
  }
}

export class EdgeCacheManager {
  private cache: RedisCacheManager;
  private prefix = 'edge';
  private readonly PERIOD_TTL: Record<string, number> = {
    '1h': 300, '24h': 900, '7d': 3600, 'default': 300,
  };

  constructor(cache: RedisCacheManager) { this.cache = cache; }

  async cacheEdgeServices(accountId: string, services: any[], ttl = 300): Promise<boolean> {
    return this.cache.set(`services:${accountId}`, { services, cachedAt: Date.now(), count: services.length }, { prefix: this.prefix, ttl });
  }

  async getEdgeServices(accountId: string): Promise<{ services: any[]; cachedAt: number; fromCache: boolean } | null> {
    const cached = await this.cache.get<{ services: any[]; cachedAt: number }>(`services:${accountId}`, { prefix: this.prefix });
    if (!cached) return null;
    return { services: cached.services, cachedAt: cached.cachedAt, fromCache: true };
  }

  async cacheEdgeMetrics(accountId: string, metrics: any[], period = 'default'): Promise<boolean> {
    const ttl = this.PERIOD_TTL[period] || this.PERIOD_TTL['default'];
    return this.cache.set(`metrics:${accountId}:${period}`, { metrics, cachedAt: Date.now(), period, count: metrics.length }, { prefix: this.prefix, ttl });
  }

  async getEdgeMetrics(accountId: string, period = 'default'): Promise<{ metrics: any[]; cachedAt: number; fromCache: boolean } | null> {
    const cached = await this.cache.get<{ metrics: any[]; cachedAt: number }>(`metrics:${accountId}:${period}`, { prefix: this.prefix });
    if (!cached) return null;
    return { metrics: cached.metrics, cachedAt: cached.cachedAt, fromCache: true };
  }

  async cacheDiscoveryResult(accountId: string, result: { services: any[]; metrics: any[]; regionsScanned: string[]; permissionErrors?: any[]; breakdown?: any }, ttl = 300): Promise<boolean> {
    return this.cache.set(`discovery:${accountId}`, { ...result, cachedAt: Date.now(), serviceCount: result.services.length, metricCount: result.metrics.length }, { prefix: this.prefix, ttl });
  }

  async getDiscoveryResult(accountId: string): Promise<any | null> {
    const cached = await this.cache.get<any>(`discovery:${accountId}`, { prefix: this.prefix });
    if (!cached) return null;
    return { ...cached, fromCache: true };
  }

  async getCacheInfo(accountId: string): Promise<{ hasCache: boolean; cacheAge?: number; serviceCount?: number; metricCount?: number }> {
    const cached = await this.cache.get<any>(`discovery:${accountId}`, { prefix: this.prefix });
    if (!cached) return { hasCache: false };
    return { hasCache: true, cacheAge: Math.round((Date.now() - cached.cachedAt) / 1000), serviceCount: cached.serviceCount, metricCount: cached.metricCount };
  }

  async invalidateAccount(accountId: string): Promise<number> {
    return this.cache.deletePattern(`*${accountId}*`, { prefix: this.prefix });
  }

  async invalidateAll(): Promise<number> {
    return this.cache.deletePattern('*', { prefix: this.prefix });
  }

  async isCacheValid(accountId: string, maxAgeSeconds = 300): Promise<boolean> {
    const cached = await this.cache.get<{ cachedAt: number }>(`discovery:${accountId}`, { prefix: this.prefix });
    if (!cached) return false;
    return (Date.now() - cached.cachedAt) / 1000 < maxAgeSeconds;
  }
}

// ============================================================================
// DECORATORS
// ============================================================================

export function cached(keyGenerator: (...args: any[]) => string, options: CacheOptions = {}) {
  return function (_target: any, _propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const cacheKey = keyGenerator(...args);
      const hit = await cacheManager.get(cacheKey, options);
      if (hit !== null) return hit;
      const result = await method.apply(this, args);
      await cacheManager.set(cacheKey, result, options);
      return result;
    };
  };
}

export function invalidateCache(keyPatterns: string[] | ((...args: any[]) => string[])) {
  return function (_target: any, _propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const result = await method.apply(this, args);
      const patterns = typeof keyPatterns === 'function' ? keyPatterns(...args) : keyPatterns;
      for (const pattern of patterns) await cacheManager.deletePattern(pattern);
      return result;
    };
  };
}

// ============================================================================
// GLOBAL INSTANCES
// ============================================================================

export const cacheManager = new RedisCacheManager();
export const securityCache = new SecurityCacheManager(cacheManager);
export const costCache = new CostCacheManager(cacheManager);
export const metricsCache = new MetricsCacheManager(cacheManager);
export const edgeCache = new EdgeCacheManager(cacheManager);

// ============================================================================
// HEALTH CHECK
// ============================================================================

export async function checkRedisHealth(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number; error?: string; backend: string }> {
  try {
    const start = Date.now();
    await cacheManager.set('health-check', 'ok', { ttl: 10 });
    const result = await cacheManager.get('health-check');
    const latency = Date.now() - start;
    await cacheManager.delete('health-check');
    const stats = cacheManager.getStats();
    if (result === 'ok') {
      return { status: 'healthy', latency, backend: stats.backend };
    }
    return { status: 'unhealthy', error: 'Health check value mismatch', backend: stats.backend };
  } catch (err) {
    return { status: 'unhealthy', error: (err as Error).message, backend: 'unknown' };
  }
}
