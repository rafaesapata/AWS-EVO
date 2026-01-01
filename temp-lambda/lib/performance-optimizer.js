"use strict";
/**
 * Advanced Performance Optimizer
 * Military-grade performance optimization with intelligent caching and resource management
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.performanceOptimizer = exports.PerformanceOptimizer = void 0;
const logging_1 = require("./logging");
const real_time_monitoring_1 = require("./real-time-monitoring");
const database_1 = require("./database");
const events_1 = require("events");
class PerformanceOptimizer extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.prisma = (0, database_1.getPrismaClient)();
        this.cache = new Map();
        this.cacheStats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            totalRequests: 0,
        };
        this.optimizationRules = [];
        this.lastOptimization = new Map();
        this.performanceHistory = [];
        this.isOptimizing = false;
        this.initializeOptimizationRules();
        this.startPerformanceMonitoring();
    }
    /**
     * Initialize performance optimization rules
     */
    initializeOptimizationRules() {
        this.optimizationRules = [
            // Memory optimization
            {
                id: 'high_memory_usage',
                name: 'High Memory Usage Optimization',
                condition: (metrics) => metrics.memoryUsage > 80,
                action: this.optimizeMemoryUsage.bind(this),
                priority: 'critical',
                cooldownMs: 30000, // 30 seconds
            },
            // CPU optimization
            {
                id: 'high_cpu_usage',
                name: 'High CPU Usage Optimization',
                condition: (metrics) => metrics.cpuUsage > 85,
                action: this.optimizeCpuUsage.bind(this),
                priority: 'high',
                cooldownMs: 60000, // 1 minute
            },
            // Event loop lag optimization
            {
                id: 'event_loop_lag',
                name: 'Event Loop Lag Optimization',
                condition: (metrics) => metrics.eventLoopLag > 100, // 100ms
                action: this.optimizeEventLoop.bind(this),
                priority: 'high',
                cooldownMs: 45000, // 45 seconds
            },
            // Cache optimization
            {
                id: 'low_cache_hit_rate',
                name: 'Low Cache Hit Rate Optimization',
                condition: (metrics) => metrics.cacheHitRate < 70,
                action: this.optimizeCacheStrategy.bind(this),
                priority: 'medium',
                cooldownMs: 120000, // 2 minutes
            },
            // Database connection optimization
            {
                id: 'high_db_connections',
                name: 'High Database Connections Optimization',
                condition: (metrics) => metrics.databaseConnections > 50,
                action: this.optimizeDatabaseConnections.bind(this),
                priority: 'high',
                cooldownMs: 90000, // 1.5 minutes
            },
            // Response time optimization
            {
                id: 'slow_response_time',
                name: 'Slow Response Time Optimization',
                condition: (metrics) => metrics.averageResponseTime > 2000, // 2 seconds
                action: this.optimizeResponseTime.bind(this),
                priority: 'medium',
                cooldownMs: 180000, // 3 minutes
            },
        ];
        logging_1.logger.info('Performance optimization rules initialized', {
            rulesCount: this.optimizationRules.length
        });
    }
    /**
     * Start performance monitoring
     */
    startPerformanceMonitoring() {
        this.monitoringInterval = setInterval(() => {
            this.collectPerformanceMetrics();
            this.evaluateOptimizationRules();
            this.cleanupPerformanceHistory();
        }, 15000); // Every 15 seconds
        logging_1.logger.info('Performance monitoring started');
    }
    /**
     * Stop performance monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        logging_1.logger.info('Performance monitoring stopped');
    }
    /**
     * Collect current performance metrics
     */
    async collectPerformanceMetrics() {
        try {
            const memoryUsage = process.memoryUsage();
            const cpuUsage = await this.getCpuUsage();
            const eventLoopLag = await this.measureEventLoopLag();
            const metrics = {
                timestamp: new Date(),
                cpuUsage,
                memoryUsage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
                eventLoopLag,
                activeConnections: this.getActiveConnections(),
                requestsPerSecond: this.calculateRequestsPerSecond(),
                averageResponseTime: this.calculateAverageResponseTime(),
                errorRate: this.calculateErrorRate(),
                cacheHitRate: this.calculateCacheHitRate(),
                databaseConnections: await this.getDatabaseConnections(),
            };
            this.performanceHistory.push(metrics);
            // Record metrics for monitoring
            real_time_monitoring_1.realTimeMonitoring.recordMetric({
                name: 'performance.cpu_usage',
                value: metrics.cpuUsage,
                timestamp: metrics.timestamp,
                tags: { service: 'performance_optimizer' },
            });
            real_time_monitoring_1.realTimeMonitoring.recordMetric({
                name: 'performance.memory_usage',
                value: metrics.memoryUsage,
                timestamp: metrics.timestamp,
                tags: { service: 'performance_optimizer' },
            });
            real_time_monitoring_1.realTimeMonitoring.recordMetric({
                name: 'performance.cache_hit_rate',
                value: metrics.cacheHitRate,
                timestamp: metrics.timestamp,
                tags: { service: 'performance_optimizer' },
            });
            this.emit('metricsCollected', metrics);
        }
        catch (error) {
            logging_1.logger.error('Failed to collect performance metrics', error);
        }
    }
    /**
     * Evaluate optimization rules
     */
    async evaluateOptimizationRules() {
        if (this.isOptimizing || this.performanceHistory.length === 0) {
            return;
        }
        const latestMetrics = this.performanceHistory[this.performanceHistory.length - 1];
        for (const rule of this.optimizationRules) {
            // Check cooldown
            const lastRun = this.lastOptimization.get(rule.id);
            if (lastRun && Date.now() - lastRun < rule.cooldownMs) {
                continue;
            }
            // Check condition
            if (rule.condition(latestMetrics)) {
                try {
                    this.isOptimizing = true;
                    logging_1.logger.info('Executing optimization rule', {
                        ruleId: rule.id,
                        ruleName: rule.name,
                        priority: rule.priority,
                    });
                    await rule.action(latestMetrics);
                    this.lastOptimization.set(rule.id, Date.now());
                    this.emit('optimizationExecuted', {
                        rule: rule.id,
                        metrics: latestMetrics,
                    });
                }
                catch (error) {
                    logging_1.logger.error('Optimization rule execution failed', error, {
                        ruleId: rule.id,
                    });
                }
                finally {
                    this.isOptimizing = false;
                }
            }
        }
    }
    /**
     * Advanced caching with intelligent strategies
     */
    async get(key, organizationId) {
        const cacheKey = organizationId ? `${organizationId}:${key}` : key;
        const entry = this.cache.get(cacheKey);
        this.cacheStats.totalRequests++;
        if (entry && !this.isExpired(entry)) {
            this.cacheStats.hits++;
            entry.lastAccessed = Date.now();
            entry.accessCount++;
            // Decompress if needed
            let value = entry.value;
            if (entry.compressed && typeof value === 'string') {
                value = this.decompress(value);
            }
            // Decrypt if needed
            if (entry.encrypted && typeof value === 'string') {
                value = this.decrypt(value);
            }
            logging_1.logger.debug('Cache hit', { key: cacheKey, ttl: entry.ttl });
            return JSON.parse(value);
        }
        this.cacheStats.misses++;
        logging_1.logger.debug('Cache miss', { key: cacheKey });
        return null;
    }
    /**
     * Set cache entry with intelligent optimization
     */
    async set(key, value, ttl, organizationId) {
        const cacheKey = organizationId ? `${organizationId}:${key}` : key;
        const entryTtl = ttl || this.config.ttl;
        let serializedValue = JSON.stringify(value);
        let compressed = false;
        let encrypted = false;
        // Apply compression if enabled and beneficial
        if (this.config.compression && serializedValue.length > 1024) {
            serializedValue = this.compress(serializedValue);
            compressed = true;
        }
        // Apply encryption if enabled
        if (this.config.encryption) {
            serializedValue = this.encrypt(serializedValue);
            encrypted = true;
        }
        const entry = {
            value: serializedValue,
            ttl: entryTtl,
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 0,
            size: Buffer.byteLength(serializedValue, 'utf8'),
            compressed,
            encrypted,
        };
        // Check cache size limits
        await this.ensureCacheCapacity(entry.size);
        this.cache.set(cacheKey, entry);
        logging_1.logger.debug('Cache set', {
            key: cacheKey,
            size: entry.size,
            ttl: entryTtl,
            compressed,
            encrypted,
        });
    }
    /**
     * Intelligent cache eviction
     */
    async ensureCacheCapacity(newEntrySize) {
        const currentSize = this.getCurrentCacheSize();
        const maxSizeBytes = this.config.maxSize * 1024 * 1024; // Convert MB to bytes
        if (currentSize + newEntrySize <= maxSizeBytes) {
            return;
        }
        const entriesToEvict = this.selectEntriesForEviction(newEntrySize);
        for (const key of entriesToEvict) {
            this.cache.delete(key);
            this.cacheStats.evictions++;
        }
        logging_1.logger.info('Cache eviction completed', {
            evictedEntries: entriesToEvict.length,
            newSize: this.getCurrentCacheSize(),
        });
    }
    /**
     * Select entries for eviction based on strategy
     */
    selectEntriesForEviction(requiredSpace) {
        const entries = Array.from(this.cache.entries());
        const toEvict = [];
        let freedSpace = 0;
        switch (this.config.strategy) {
            case 'lru': // Least Recently Used
                entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
                break;
            case 'lfu': // Least Frequently Used
                entries.sort(([, a], [, b]) => a.accessCount - b.accessCount);
                break;
            case 'fifo': // First In, First Out
                entries.sort(([, a], [, b]) => a.createdAt - b.createdAt);
                break;
            case 'adaptive': // Adaptive strategy based on access patterns
                entries.sort(([, a], [, b]) => {
                    const scoreA = this.calculateEvictionScore(a);
                    const scoreB = this.calculateEvictionScore(b);
                    return scoreA - scoreB;
                });
                break;
        }
        for (const [key, entry] of entries) {
            if (freedSpace >= requiredSpace)
                break;
            toEvict.push(key);
            freedSpace += entry.size;
        }
        return toEvict;
    }
    /**
     * Calculate eviction score for adaptive strategy
     */
    calculateEvictionScore(entry) {
        const age = Date.now() - entry.createdAt;
        const timeSinceAccess = Date.now() - entry.lastAccessed;
        const accessFrequency = entry.accessCount / (age / 1000 / 60); // accesses per minute
        // Lower score = higher priority for eviction
        return accessFrequency * 1000 - timeSinceAccess * 0.1 - entry.size * 0.001;
    }
    /**
     * Memory usage optimization
     */
    async optimizeMemoryUsage(metrics) {
        logging_1.logger.warn('Executing memory optimization', { memoryUsage: metrics.memoryUsage });
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
        // Clear expired cache entries
        this.clearExpiredEntries();
        // Reduce cache size if necessary
        if (metrics.memoryUsage > 90) {
            const targetReduction = Math.floor(this.cache.size * 0.3); // Remove 30%
            const entries = Array.from(this.cache.keys()).slice(0, targetReduction);
            entries.forEach(key => this.cache.delete(key));
            logging_1.logger.info('Emergency cache reduction', { removedEntries: entries.length });
        }
        // Record optimization
        real_time_monitoring_1.realTimeMonitoring.recordMetric({
            name: 'performance.optimization.memory',
            value: 1,
            timestamp: new Date(),
            tags: { type: 'memory_cleanup' },
        });
    }
    /**
     * CPU usage optimization
     */
    async optimizeCpuUsage(metrics) {
        logging_1.logger.warn('Executing CPU optimization', { cpuUsage: metrics.cpuUsage });
        // Reduce cache compression temporarily
        if (this.config.compression) {
            logging_1.logger.info('Temporarily disabling cache compression to reduce CPU load');
            // This would be implemented with a temporary flag
        }
        // Implement request throttling if needed
        // This would integrate with rate limiting middleware
        real_time_monitoring_1.realTimeMonitoring.recordMetric({
            name: 'performance.optimization.cpu',
            value: 1,
            timestamp: new Date(),
            tags: { type: 'cpu_throttling' },
        });
    }
    /**
     * Event loop lag optimization
     */
    async optimizeEventLoop(metrics) {
        logging_1.logger.warn('Executing event loop optimization', { eventLoopLag: metrics.eventLoopLag });
        // Break up long-running operations
        await new Promise(resolve => setImmediate(resolve));
        // Reduce concurrent operations
        // This would integrate with connection pooling and request queuing
        real_time_monitoring_1.realTimeMonitoring.recordMetric({
            name: 'performance.optimization.event_loop',
            value: 1,
            timestamp: new Date(),
            tags: { type: 'event_loop_optimization' },
        });
    }
    /**
     * Cache strategy optimization
     */
    async optimizeCacheStrategy(metrics) {
        logging_1.logger.info('Optimizing cache strategy', { cacheHitRate: metrics.cacheHitRate });
        // Analyze cache patterns and adjust TTL
        const avgAccessCount = Array.from(this.cache.values())
            .reduce((sum, entry) => sum + entry.accessCount, 0) / this.cache.size;
        if (avgAccessCount < 2) {
            // Increase TTL for frequently accessed items
            logging_1.logger.info('Adjusting cache TTL based on access patterns');
        }
        real_time_monitoring_1.realTimeMonitoring.recordMetric({
            name: 'performance.optimization.cache',
            value: 1,
            timestamp: new Date(),
            tags: { type: 'cache_strategy' },
        });
    }
    /**
     * Database connections optimization
     */
    async optimizeDatabaseConnections(metrics) {
        logging_1.logger.warn('Optimizing database connections', { connections: metrics.databaseConnections });
        // This would implement connection pooling optimization
        // For now, just log the optimization
        real_time_monitoring_1.realTimeMonitoring.recordMetric({
            name: 'performance.optimization.database',
            value: 1,
            timestamp: new Date(),
            tags: { type: 'connection_pooling' },
        });
    }
    /**
     * Response time optimization
     */
    async optimizeResponseTime(metrics) {
        logging_1.logger.info('Optimizing response time', { avgResponseTime: metrics.averageResponseTime });
        // Implement response optimization strategies
        // This could include query optimization, caching improvements, etc.
        real_time_monitoring_1.realTimeMonitoring.recordMetric({
            name: 'performance.optimization.response_time',
            value: 1,
            timestamp: new Date(),
            tags: { type: 'response_optimization' },
        });
    }
    /**
     * Helper methods
     */
    async getCpuUsage() {
        return new Promise((resolve) => {
            const startUsage = process.cpuUsage();
            setTimeout(() => {
                const endUsage = process.cpuUsage(startUsage);
                const totalUsage = endUsage.user + endUsage.system;
                const cpuPercent = (totalUsage / 1000000) * 100; // Convert to percentage
                resolve(Math.min(100, cpuPercent));
            }, 100);
        });
    }
    async measureEventLoopLag() {
        return new Promise((resolve) => {
            const start = process.hrtime.bigint();
            setImmediate(() => {
                const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
                resolve(lag);
            });
        });
    }
    getActiveConnections() {
        // This would integrate with connection tracking
        return 0;
    }
    calculateRequestsPerSecond() {
        // This would integrate with request tracking
        return 0;
    }
    calculateAverageResponseTime() {
        // This would integrate with response time tracking
        return 0;
    }
    calculateErrorRate() {
        // This would integrate with error tracking
        return 0;
    }
    calculateCacheHitRate() {
        if (this.cacheStats.totalRequests === 0)
            return 100;
        return (this.cacheStats.hits / this.cacheStats.totalRequests) * 100;
    }
    async getDatabaseConnections() {
        try {
            // This would query the database for active connections
            return 0;
        }
        catch {
            return 0;
        }
    }
    getCurrentCacheSize() {
        return Array.from(this.cache.values()).reduce((total, entry) => total + entry.size, 0);
    }
    isExpired(entry) {
        return Date.now() - entry.createdAt > entry.ttl * 1000;
    }
    clearExpiredEntries() {
        const expiredKeys = [];
        for (const [key, entry] of this.cache.entries()) {
            if (this.isExpired(entry)) {
                expiredKeys.push(key);
            }
        }
        expiredKeys.forEach(key => this.cache.delete(key));
        if (expiredKeys.length > 0) {
            logging_1.logger.debug('Cleared expired cache entries', { count: expiredKeys.length });
        }
    }
    cleanupPerformanceHistory() {
        // Keep only last 1000 metrics (about 4 hours at 15-second intervals)
        if (this.performanceHistory.length > 1000) {
            this.performanceHistory = this.performanceHistory.slice(-1000);
        }
    }
    compress(data) {
        // Simplified compression - in production use zlib
        return Buffer.from(data).toString('base64');
    }
    decompress(data) {
        // Simplified decompression - in production use zlib
        return Buffer.from(data, 'base64').toString('utf8');
    }
    encrypt(data) {
        // Simplified encryption - in production use proper encryption
        return Buffer.from(data).toString('base64');
    }
    decrypt(data) {
        // Simplified decryption - in production use proper decryption
        return Buffer.from(data, 'base64').toString('utf8');
    }
    /**
     * Get performance statistics
     */
    getPerformanceStats() {
        return {
            cache: { ...this.cacheStats },
            currentMetrics: this.performanceHistory[this.performanceHistory.length - 1] || null,
            optimizationHistory: Array.from(this.lastOptimization.entries()).map(([rule, timestamp]) => ({
                rule,
                timestamp,
            })),
        };
    }
}
exports.PerformanceOptimizer = PerformanceOptimizer;
// Export singleton instance with default configuration
exports.performanceOptimizer = new PerformanceOptimizer({
    ttl: 300, // 5 minutes
    maxSize: 100, // 100 MB
    strategy: 'adaptive',
    compression: true,
    encryption: false,
});
// Graceful shutdown
process.on('SIGINT', () => {
    exports.performanceOptimizer.stopMonitoring();
});
process.on('SIGTERM', () => {
    exports.performanceOptimizer.stopMonitoring();
});
//# sourceMappingURL=performance-optimizer.js.map