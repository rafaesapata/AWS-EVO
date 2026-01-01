"use strict";
/**
 * Redis Cache Implementation
 * High-performance distributed caching system
 *
 * NOTA: Usa cache em memória (não depende de ioredis)
 * Para usar Redis real, adicionar ioredis ao Lambda layer
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.edgeCache = exports.metricsCache = exports.costCache = exports.securityCache = exports.cacheManager = exports.EdgeCacheManager = exports.MetricsCacheManager = exports.CostCacheManager = exports.SecurityCacheManager = exports.RedisCacheManager = void 0;
exports.cached = cached;
exports.invalidateCache = invalidateCache;
exports.checkRedisHealth = checkRedisHealth;
const logging_js_1 = require("./logging.js");
// In-memory cache fallback
const memoryCache = new Map();
/**
 * Redis Cache Manager
 * Usa cache em memória por padrão (funciona em Lambda sem dependências extras)
 */
class RedisCacheManager {
    constructor(options) {
        this.redis = null;
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            errors: 0,
            hitRate: 0
        };
        this.defaultTTL = 3600; // 1 hour
        this.keyPrefix = 'evo-uds:';
        this.useMemoryFallback = true; // Sempre usar memória por padrão
        // Sempre usar cache em memória (mais simples e funciona em Lambda)
        logging_js_1.logger.info('Using in-memory cache');
    }
    /**
     * Get value from cache
     */
    async get(key, options = {}) {
        try {
            const fullKey = this.buildKey(key, options.prefix);
            const cached = memoryCache.get(fullKey);
            if (!cached || cached.expiry < Date.now()) {
                if (cached)
                    memoryCache.delete(fullKey);
                this.stats.misses++;
                return null;
            }
            this.stats.hits++;
            return cached.value;
        }
        catch (error) {
            logging_js_1.logger.error('Cache get error', error, { key });
            this.stats.errors++;
            return null;
        }
    }
    /**
     * Set value in cache
     */
    async set(key, value, options = {}) {
        try {
            const fullKey = this.buildKey(key, options.prefix);
            const ttl = options.ttl || this.defaultTTL;
            memoryCache.set(fullKey, {
                value: value,
                expiry: Date.now() + (ttl * 1000)
            });
            this.stats.sets++;
            return true;
        }
        catch (error) {
            logging_js_1.logger.error('Cache set error', error, { key });
            this.stats.errors++;
            return false;
        }
    }
    /**
     * Delete key from cache
     */
    async delete(key, options = {}) {
        try {
            const fullKey = this.buildKey(key, options.prefix);
            const existed = memoryCache.has(fullKey);
            memoryCache.delete(fullKey);
            if (existed)
                this.stats.deletes++;
            return existed;
        }
        catch (error) {
            logging_js_1.logger.error('Cache delete error', error, { key });
            this.stats.errors++;
            return false;
        }
    }
    /**
     * Check if key exists
     */
    async exists(key, options = {}) {
        try {
            const fullKey = this.buildKey(key, options.prefix);
            const cached = memoryCache.get(fullKey);
            if (!cached || cached.expiry < Date.now()) {
                if (cached)
                    memoryCache.delete(fullKey);
                return false;
            }
            return true;
        }
        catch (error) {
            logging_js_1.logger.error('Cache exists error', error, { key });
            return false;
        }
    }
    /**
     * Get multiple keys
     */
    async mget(keys, options = {}) {
        try {
            const fullKeys = keys.map(key => this.buildKey(key, options.prefix));
            return fullKeys.map(fullKey => {
                const cached = memoryCache.get(fullKey);
                if (!cached || cached.expiry < Date.now()) {
                    if (cached)
                        memoryCache.delete(fullKey);
                    this.stats.misses++;
                    return null;
                }
                this.stats.hits++;
                return cached.value;
            });
        }
        catch (error) {
            logging_js_1.logger.error('Cache mget error', error, { keys });
            this.stats.errors++;
            return keys.map(() => null);
        }
    }
    /**
     * Set multiple keys
     */
    async mset(keyValuePairs, options = {}) {
        try {
            const ttl = options.ttl || this.defaultTTL;
            const expiry = Date.now() + (ttl * 1000);
            for (const [key, value] of keyValuePairs) {
                const fullKey = this.buildKey(key, options.prefix);
                memoryCache.set(fullKey, { value, expiry });
            }
            this.stats.sets += keyValuePairs.length;
            return true;
        }
        catch (error) {
            logging_js_1.logger.error('Cache mset error', error);
            this.stats.errors++;
            return false;
        }
    }
    /**
     * Increment counter
     */
    async increment(key, by = 1, options = {}) {
        try {
            const fullKey = this.buildKey(key, options.prefix);
            const cached = memoryCache.get(fullKey);
            const currentValue = cached && cached.expiry > Date.now() ? cached.value : 0;
            const newValue = currentValue + by;
            const ttl = options.ttl || this.defaultTTL;
            memoryCache.set(fullKey, { value: newValue, expiry: Date.now() + (ttl * 1000) });
            return newValue;
        }
        catch (error) {
            logging_js_1.logger.error('Cache increment error', error, { key });
            this.stats.errors++;
            return 0;
        }
    }
    /**
     * Add to set
     */
    async sadd(key, members, options = {}) {
        try {
            const fullKey = this.buildKey(key, options.prefix);
            const cached = memoryCache.get(fullKey);
            const currentSet = cached && cached.expiry > Date.now() ? new Set(cached.value) : new Set();
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
        }
        catch (error) {
            logging_js_1.logger.error('Cache sadd error', error, { key });
            this.stats.errors++;
            return 0;
        }
    }
    /**
     * Get set members
     */
    async smembers(key, options = {}) {
        try {
            const fullKey = this.buildKey(key, options.prefix);
            const cached = memoryCache.get(fullKey);
            if (!cached || cached.expiry < Date.now()) {
                if (cached)
                    memoryCache.delete(fullKey);
                return [];
            }
            return cached.value;
        }
        catch (error) {
            logging_js_1.logger.error('Cache smembers error', error, { key });
            this.stats.errors++;
            return [];
        }
    }
    /**
     * Remove from set
     */
    async srem(key, members, options = {}) {
        try {
            const fullKey = this.buildKey(key, options.prefix);
            const cached = memoryCache.get(fullKey);
            if (!cached || cached.expiry < Date.now()) {
                if (cached)
                    memoryCache.delete(fullKey);
                return 0;
            }
            const currentSet = new Set(cached.value);
            let removed = 0;
            for (const member of members) {
                if (currentSet.delete(member))
                    removed++;
            }
            memoryCache.set(fullKey, { value: Array.from(currentSet), expiry: cached.expiry });
            return removed;
        }
        catch (error) {
            logging_js_1.logger.error('Cache srem error', error, { key });
            this.stats.errors++;
            return 0;
        }
    }
    /**
     * Get keys by pattern
     */
    async keys(pattern, options = {}) {
        try {
            const fullPattern = this.buildKey(pattern, options.prefix);
            const now = Date.now();
            const matchingKeys = [];
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
        }
        catch (error) {
            logging_js_1.logger.error('Cache keys error', error, { pattern });
            this.stats.errors++;
            return [];
        }
    }
    /**
     * Delete keys by pattern
     */
    async deletePattern(pattern, options = {}) {
        try {
            const keys = await this.keys(pattern, options);
            if (keys.length === 0)
                return 0;
            for (const key of keys) {
                memoryCache.delete(key);
            }
            this.stats.deletes += keys.length;
            return keys.length;
        }
        catch (error) {
            logging_js_1.logger.error('Cache delete pattern error', error, { pattern });
            this.stats.errors++;
            return 0;
        }
    }
    /**
     * Get cache statistics
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0
        };
    }
    /**
     * Clear all cache statistics
     */
    clearStats() {
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
    async flush() {
        try {
            memoryCache.clear();
            logging_js_1.logger.info('Memory cache flushed');
            return true;
        }
        catch (error) {
            logging_js_1.logger.error('Cache flush error', error);
            return false;
        }
    }
    /**
     * Close connection
     */
    async close() {
        // No-op for memory cache
    }
    /**
     * Build full cache key
     */
    buildKey(key, prefix) {
        const fullPrefix = prefix ? `${this.keyPrefix}${prefix}:` : this.keyPrefix;
        return `${fullPrefix}${key}`;
    }
}
exports.RedisCacheManager = RedisCacheManager;
// Cache decorators for easy usage
function cached(keyGenerator, options = {}) {
    return function (target, propertyName, descriptor) {
        const method = descriptor.value;
        descriptor.value = async function (...args) {
            const cacheKey = keyGenerator(...args);
            // Try to get from cache first
            const cached = await exports.cacheManager.get(cacheKey, options);
            if (cached !== null) {
                return cached;
            }
            // Execute original method
            const result = await method.apply(this, args);
            // Cache the result
            await exports.cacheManager.set(cacheKey, result, options);
            return result;
        };
    };
}
// Cache invalidation decorator
function invalidateCache(keyPatterns) {
    return function (target, propertyName, descriptor) {
        const method = descriptor.value;
        descriptor.value = async function (...args) {
            const result = await method.apply(this, args);
            // Invalidate cache keys
            const patterns = typeof keyPatterns === 'function'
                ? keyPatterns(...args)
                : keyPatterns;
            for (const pattern of patterns) {
                await exports.cacheManager.deletePattern(pattern);
            }
            return result;
        };
    };
}
// Specialized cache managers for different data types
class SecurityCacheManager {
    constructor(cache) {
        this.prefix = 'security';
        this.cache = cache;
    }
    async cacheFindings(orgId, findings, ttl = 300) {
        await this.cache.set(`findings:${orgId}`, findings, {
            prefix: this.prefix,
            ttl
        });
    }
    async getFindings(orgId) {
        return this.cache.get(`findings:${orgId}`, { prefix: this.prefix });
    }
    async cacheScanResult(scanId, result, ttl = 3600) {
        await this.cache.set(`scan:${scanId}`, result, {
            prefix: this.prefix,
            ttl
        });
    }
    async getScanResult(scanId) {
        return this.cache.get(`scan:${scanId}`, { prefix: this.prefix });
    }
    async invalidateOrgCache(orgId) {
        await this.cache.deletePattern(`*:${orgId}`, { prefix: this.prefix });
    }
}
exports.SecurityCacheManager = SecurityCacheManager;
class CostCacheManager {
    constructor(cache) {
        this.prefix = 'cost';
        this.cache = cache;
    }
    async cacheCostData(accountId, period, data, ttl = 1800) {
        await this.cache.set(`data:${accountId}:${period}`, data, {
            prefix: this.prefix,
            ttl
        });
    }
    async getCostData(accountId, period) {
        return this.cache.get(`data:${accountId}:${period}`, { prefix: this.prefix });
    }
    async cacheOptimizationRecommendations(accountId, recommendations, ttl = 3600) {
        await this.cache.set(`optimization:${accountId}`, recommendations, {
            prefix: this.prefix,
            ttl
        });
    }
    async getOptimizationRecommendations(accountId) {
        return this.cache.get(`optimization:${accountId}`, { prefix: this.prefix });
    }
}
exports.CostCacheManager = CostCacheManager;
/**
 * Metrics Cache Manager
 * Specialized cache for CloudWatch metrics with intelligent TTL and period-based caching
 */
class MetricsCacheManager {
    constructor(cache) {
        this.prefix = 'metrics';
        // TTL por período de métricas (em segundos)
        this.PERIOD_TTL = {
            '3h': 5 * 60, // 5 minutos para dados de 3 horas
            '24h': 15 * 60, // 15 minutos para dados de 24 horas
            '7d': 60 * 60, // 1 hora para dados de 7 dias
            'default': 5 * 60, // 5 minutos padrão
        };
        this.cache = cache;
    }
    /**
     * Gera chave de cache para métricas
     */
    buildMetricsKey(accountId, resourceType, period) {
        const parts = ['account', accountId];
        if (resourceType)
            parts.push('type', resourceType);
        if (period)
            parts.push('period', period);
        return parts.join(':');
    }
    /**
     * Cache de métricas por conta e período
     */
    async cacheMetrics(accountId, metrics, period = 'default') {
        const key = this.buildMetricsKey(accountId, undefined, period);
        const ttl = this.PERIOD_TTL[period] || this.PERIOD_TTL['default'];
        logging_js_1.logger.info(`[MetricsCache] Caching ${metrics.length} metrics for account ${accountId}, period ${period}, TTL ${ttl}s`);
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
    async getMetrics(accountId, period = 'default') {
        const key = this.buildMetricsKey(accountId, undefined, period);
        const cached = await this.cache.get(key, { prefix: this.prefix });
        if (cached) {
            const cacheAge = Math.round((Date.now() - cached.cachedAt) / 1000);
            logging_js_1.logger.info(`[MetricsCache] Cache HIT for account ${accountId}, period ${period}, age ${cacheAge}s, ${cached.count} metrics`);
            return {
                metrics: cached.metrics,
                cachedAt: cached.cachedAt,
                fromCache: true,
            };
        }
        logging_js_1.logger.info(`[MetricsCache] Cache MISS for account ${accountId}, period ${period}`);
        return null;
    }
    /**
     * Cache de recursos descobertos
     */
    async cacheResources(accountId, resources, ttl = 300 // 5 minutos
    ) {
        const key = `resources:${accountId}`;
        logging_js_1.logger.info(`[MetricsCache] Caching ${resources.length} resources for account ${accountId}`);
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
    async getResources(accountId) {
        const key = `resources:${accountId}`;
        const cached = await this.cache.get(key, { prefix: this.prefix });
        if (cached) {
            const cacheAge = Math.round((Date.now() - cached.cachedAt) / 1000);
            logging_js_1.logger.info(`[MetricsCache] Resources cache HIT for account ${accountId}, age ${cacheAge}s, ${cached.count} resources`);
            return {
                resources: cached.resources,
                cachedAt: cached.cachedAt,
                fromCache: true,
            };
        }
        logging_js_1.logger.info(`[MetricsCache] Resources cache MISS for account ${accountId}`);
        return null;
    }
    /**
     * Cache de resultado completo de coleta (recursos + métricas)
     */
    async cacheCollectionResult(accountId, result, ttl = 300) {
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
    async getCollectionResult(accountId) {
        const key = `collection:${accountId}`;
        const cached = await this.cache.get(key, { prefix: this.prefix });
        if (cached) {
            const cacheAge = Math.round((Date.now() - cached.cachedAt) / 1000);
            logging_js_1.logger.info(`[MetricsCache] Collection cache HIT for account ${accountId}, age ${cacheAge}s`);
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
    async invalidateAccount(accountId) {
        logging_js_1.logger.info(`[MetricsCache] Invalidating all cache for account ${accountId}`);
        return this.cache.deletePattern(`*${accountId}*`, { prefix: this.prefix });
    }
    /**
     * Invalidar todo o cache de métricas
     */
    async invalidateAll() {
        logging_js_1.logger.info(`[MetricsCache] Invalidating all metrics cache`);
        return this.cache.deletePattern('*', { prefix: this.prefix });
    }
    /**
     * Verificar se cache existe e é válido
     */
    async isCacheValid(accountId, maxAgeSeconds = 300) {
        const key = `collection:${accountId}`;
        const cached = await this.cache.get(key, { prefix: this.prefix });
        if (!cached)
            return false;
        const cacheAge = (Date.now() - cached.cachedAt) / 1000;
        return cacheAge < maxAgeSeconds;
    }
    /**
     * Obter estatísticas do cache de métricas
     */
    async getCacheInfo(accountId) {
        const key = `collection:${accountId}`;
        const cached = await this.cache.get(key, { prefix: this.prefix });
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
exports.MetricsCacheManager = MetricsCacheManager;
/**
 * Edge Services Cache Manager
 * Specialized cache for CloudFront, WAF, and Load Balancer edge services
 */
class EdgeCacheManager {
    constructor(cache) {
        this.prefix = 'edge';
        // TTL por período (em segundos)
        this.PERIOD_TTL = {
            '1h': 5 * 60, // 5 minutos para dados de 1 hora
            '24h': 15 * 60, // 15 minutos para dados de 24 horas
            '7d': 60 * 60, // 1 hora para dados de 7 dias
            'default': 5 * 60, // 5 minutos padrão
        };
        this.cache = cache;
    }
    /**
     * Cache de serviços de borda descobertos
     */
    async cacheEdgeServices(accountId, services, ttl = 300) {
        const key = `services:${accountId}`;
        logging_js_1.logger.info(`[EdgeCache] Caching ${services.length} edge services for account ${accountId}`);
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
    async getEdgeServices(accountId) {
        const key = `services:${accountId}`;
        const cached = await this.cache.get(key, { prefix: this.prefix });
        if (cached) {
            const cacheAge = Math.round((Date.now() - cached.cachedAt) / 1000);
            logging_js_1.logger.info(`[EdgeCache] Services cache HIT for account ${accountId}, age ${cacheAge}s, ${cached.count} services`);
            return {
                services: cached.services,
                cachedAt: cached.cachedAt,
                fromCache: true,
            };
        }
        logging_js_1.logger.info(`[EdgeCache] Services cache MISS for account ${accountId}`);
        return null;
    }
    /**
     * Cache de métricas de borda
     */
    async cacheEdgeMetrics(accountId, metrics, period = 'default') {
        const key = `metrics:${accountId}:${period}`;
        const ttl = this.PERIOD_TTL[period] || this.PERIOD_TTL['default'];
        logging_js_1.logger.info(`[EdgeCache] Caching ${metrics.length} edge metrics for account ${accountId}, period ${period}, TTL ${ttl}s`);
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
    async getEdgeMetrics(accountId, period = 'default') {
        const key = `metrics:${accountId}:${period}`;
        const cached = await this.cache.get(key, { prefix: this.prefix });
        if (cached) {
            const cacheAge = Math.round((Date.now() - cached.cachedAt) / 1000);
            logging_js_1.logger.info(`[EdgeCache] Metrics cache HIT for account ${accountId}, period ${period}, age ${cacheAge}s, ${cached.count} metrics`);
            return {
                metrics: cached.metrics,
                cachedAt: cached.cachedAt,
                fromCache: true,
            };
        }
        logging_js_1.logger.info(`[EdgeCache] Metrics cache MISS for account ${accountId}, period ${period}`);
        return null;
    }
    /**
     * Cache de resultado completo de descoberta (serviços + métricas)
     */
    async cacheDiscoveryResult(accountId, result, ttl = 300) {
        const key = `discovery:${accountId}`;
        logging_js_1.logger.info(`[EdgeCache] Caching discovery result for account ${accountId}, ${result.services.length} services, ${result.metrics.length} metrics`);
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
    async getDiscoveryResult(accountId) {
        const key = `discovery:${accountId}`;
        const cached = await this.cache.get(key, { prefix: this.prefix });
        if (cached) {
            const cacheAge = Math.round((Date.now() - cached.cachedAt) / 1000);
            logging_js_1.logger.info(`[EdgeCache] Discovery cache HIT for account ${accountId}, age ${cacheAge}s`);
            return {
                ...cached,
                fromCache: true,
            };
        }
        logging_js_1.logger.info(`[EdgeCache] Discovery cache MISS for account ${accountId}`);
        return null;
    }
    /**
     * Obter informações do cache
     */
    async getCacheInfo(accountId) {
        const key = `discovery:${accountId}`;
        const cached = await this.cache.get(key, { prefix: this.prefix });
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
    async invalidateAccount(accountId) {
        logging_js_1.logger.info(`[EdgeCache] Invalidating all cache for account ${accountId}`);
        return this.cache.deletePattern(`*${accountId}*`, { prefix: this.prefix });
    }
    /**
     * Invalidar todo o cache de edge
     */
    async invalidateAll() {
        logging_js_1.logger.info(`[EdgeCache] Invalidating all edge cache`);
        return this.cache.deletePattern('*', { prefix: this.prefix });
    }
    /**
     * Verificar se cache existe e é válido
     */
    async isCacheValid(accountId, maxAgeSeconds = 300) {
        const key = `discovery:${accountId}`;
        const cached = await this.cache.get(key, { prefix: this.prefix });
        if (!cached)
            return false;
        const cacheAge = (Date.now() - cached.cachedAt) / 1000;
        return cacheAge < maxAgeSeconds;
    }
}
exports.EdgeCacheManager = EdgeCacheManager;
// Global cache manager instance
exports.cacheManager = new RedisCacheManager();
exports.securityCache = new SecurityCacheManager(exports.cacheManager);
exports.costCache = new CostCacheManager(exports.cacheManager);
exports.metricsCache = new MetricsCacheManager(exports.cacheManager);
exports.edgeCache = new EdgeCacheManager(exports.cacheManager);
// Health check for Redis
async function checkRedisHealth() {
    try {
        const start = Date.now();
        await exports.cacheManager.set('health-check', 'ok', { ttl: 10 });
        const result = await exports.cacheManager.get('health-check');
        const latency = Date.now() - start;
        if (result === 'ok') {
            await exports.cacheManager.delete('health-check');
            return { status: 'healthy', latency };
        }
        else {
            return { status: 'unhealthy', error: 'Health check value mismatch' };
        }
    }
    catch (error) {
        return {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
//# sourceMappingURL=redis-cache.js.map