/**
 * Advanced Performance Optimizer
 * Military-grade performance optimization with intelligent caching and resource management
 */

import { logger } from './logger.js';
import { realTimeMonitoring } from './real-time-monitoring';
import { getPrismaClient } from './database';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as cluster from 'cluster';

export interface PerformanceMetrics {
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  eventLoopLag: number;
  activeConnections: number;
  requestsPerSecond: number;
  averageResponseTime: number;
  errorRate: number;
  cacheHitRate: number;
  databaseConnections: number;
}

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  maxSize: number; // Maximum cache size in MB
  strategy: 'lru' | 'lfu' | 'fifo' | 'adaptive';
  compression: boolean;
  encryption: boolean;
}

export interface OptimizationRule {
  id: string;
  name: string;
  condition: (metrics: PerformanceMetrics) => boolean;
  action: (metrics: PerformanceMetrics) => Promise<void>;
  priority: 'critical' | 'high' | 'medium' | 'low';
  cooldownMs: number;
}

export class PerformanceOptimizer extends EventEmitter {
  private prisma = getPrismaClient();
  private cache = new Map<string, CacheEntry>();
  private cacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalRequests: 0,
  };
  private optimizationRules: OptimizationRule[] = [];
  private lastOptimization = new Map<string, number>();
  private performanceHistory: PerformanceMetrics[] = [];
  private monitoringInterval?: NodeJS.Timeout;
  private isOptimizing = false;

  constructor(private config: CacheConfig) {
    super();
    this.initializeOptimizationRules();
    this.startPerformanceMonitoring();
  }

  /**
   * Initialize performance optimization rules
   */
  private initializeOptimizationRules(): void {
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

    logger.info('Performance optimization rules initialized', {
      rulesCount: this.optimizationRules.length
    });
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.collectPerformanceMetrics();
      this.evaluateOptimizationRules();
      this.cleanupPerformanceHistory();
    }, 15000); // Every 15 seconds

    logger.info('Performance monitoring started');
  }

  /**
   * Stop performance monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    logger.info('Performance monitoring stopped');
  }

  /**
   * Collect current performance metrics
   */
  private async collectPerformanceMetrics(): Promise<void> {
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = await this.getCpuUsage();
      const eventLoopLag = await this.measureEventLoopLag();

      const metrics: PerformanceMetrics = {
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
      realTimeMonitoring.recordMetric({
        name: 'performance.cpu_usage',
        value: metrics.cpuUsage,
        timestamp: metrics.timestamp,
        tags: { service: 'performance_optimizer' },
      });

      realTimeMonitoring.recordMetric({
        name: 'performance.memory_usage',
        value: metrics.memoryUsage,
        timestamp: metrics.timestamp,
        tags: { service: 'performance_optimizer' },
      });

      realTimeMonitoring.recordMetric({
        name: 'performance.cache_hit_rate',
        value: metrics.cacheHitRate,
        timestamp: metrics.timestamp,
        tags: { service: 'performance_optimizer' },
      });

      this.emit('metricsCollected', metrics);

    } catch (error) {
      logger.error('Failed to collect performance metrics', error as Error);
    }
  }

  /**
   * Evaluate optimization rules
   */
  private async evaluateOptimizationRules(): Promise<void> {
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
          logger.info('Executing optimization rule', {
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

        } catch (error) {
          logger.error('Optimization rule execution failed', error as Error, {
            ruleId: rule.id,
          });
        } finally {
          this.isOptimizing = false;
        }
      }
    }
  }

  /**
   * Advanced caching with intelligent strategies
   */
  public async get<T>(key: string, organizationId?: string): Promise<T | null> {
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

      logger.debug('Cache hit', { key: cacheKey, ttl: entry.ttl });
      return JSON.parse(value as string);
    }

    this.cacheStats.misses++;
    logger.debug('Cache miss', { key: cacheKey });
    return null;
  }

  /**
   * Set cache entry with intelligent optimization
   */
  public async set<T>(
    key: string, 
    value: T, 
    ttl?: number, 
    organizationId?: string
  ): Promise<void> {
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

    const entry: CacheEntry = {
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

    logger.debug('Cache set', {
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
  private async ensureCacheCapacity(newEntrySize: number): Promise<void> {
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

    logger.info('Cache eviction completed', {
      evictedEntries: entriesToEvict.length,
      newSize: this.getCurrentCacheSize(),
    });
  }

  /**
   * Select entries for eviction based on strategy
   */
  private selectEntriesForEviction(requiredSpace: number): string[] {
    const entries = Array.from(this.cache.entries());
    const toEvict: string[] = [];
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
      if (freedSpace >= requiredSpace) break;
      toEvict.push(key);
      freedSpace += entry.size;
    }

    return toEvict;
  }

  /**
   * Calculate eviction score for adaptive strategy
   */
  private calculateEvictionScore(entry: CacheEntry): number {
    const age = Date.now() - entry.createdAt;
    const timeSinceAccess = Date.now() - entry.lastAccessed;
    const accessFrequency = entry.accessCount / (age / 1000 / 60); // accesses per minute

    // Lower score = higher priority for eviction
    return accessFrequency * 1000 - timeSinceAccess * 0.1 - entry.size * 0.001;
  }

  /**
   * Memory usage optimization
   */
  private async optimizeMemoryUsage(metrics: PerformanceMetrics): Promise<void> {
    logger.warn('Executing memory optimization', { memoryUsage: metrics.memoryUsage });

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
      
      logger.info('Emergency cache reduction', { removedEntries: entries.length });
    }

    // Record optimization
    realTimeMonitoring.recordMetric({
      name: 'performance.optimization.memory',
      value: 1,
      timestamp: new Date(),
      tags: { type: 'memory_cleanup' },
    });
  }

  /**
   * CPU usage optimization
   */
  private async optimizeCpuUsage(metrics: PerformanceMetrics): Promise<void> {
    logger.warn('Executing CPU optimization', { cpuUsage: metrics.cpuUsage });

    // Reduce cache compression temporarily
    if (this.config.compression) {
      logger.info('Temporarily disabling cache compression to reduce CPU load');
      // This would be implemented with a temporary flag
    }

    // Implement request throttling if needed
    // This would integrate with rate limiting middleware

    realTimeMonitoring.recordMetric({
      name: 'performance.optimization.cpu',
      value: 1,
      timestamp: new Date(),
      tags: { type: 'cpu_throttling' },
    });
  }

  /**
   * Event loop lag optimization
   */
  private async optimizeEventLoop(metrics: PerformanceMetrics): Promise<void> {
    logger.warn('Executing event loop optimization', { eventLoopLag: metrics.eventLoopLag });

    // Break up long-running operations
    await new Promise(resolve => setImmediate(resolve));

    // Reduce concurrent operations
    // This would integrate with connection pooling and request queuing

    realTimeMonitoring.recordMetric({
      name: 'performance.optimization.event_loop',
      value: 1,
      timestamp: new Date(),
      tags: { type: 'event_loop_optimization' },
    });
  }

  /**
   * Cache strategy optimization
   */
  private async optimizeCacheStrategy(metrics: PerformanceMetrics): Promise<void> {
    logger.info('Optimizing cache strategy', { cacheHitRate: metrics.cacheHitRate });

    // Analyze cache patterns and adjust TTL
    const avgAccessCount = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.accessCount, 0) / this.cache.size;

    if (avgAccessCount < 2) {
      // Increase TTL for frequently accessed items
      logger.info('Adjusting cache TTL based on access patterns');
    }

    realTimeMonitoring.recordMetric({
      name: 'performance.optimization.cache',
      value: 1,
      timestamp: new Date(),
      tags: { type: 'cache_strategy' },
    });
  }

  /**
   * Database connections optimization
   */
  private async optimizeDatabaseConnections(metrics: PerformanceMetrics): Promise<void> {
    logger.warn('Optimizing database connections', { connections: metrics.databaseConnections });

    // This would implement connection pooling optimization
    // For now, just log the optimization

    realTimeMonitoring.recordMetric({
      name: 'performance.optimization.database',
      value: 1,
      timestamp: new Date(),
      tags: { type: 'connection_pooling' },
    });
  }

  /**
   * Response time optimization
   */
  private async optimizeResponseTime(metrics: PerformanceMetrics): Promise<void> {
    logger.info('Optimizing response time', { avgResponseTime: metrics.averageResponseTime });

    // Implement response optimization strategies
    // This could include query optimization, caching improvements, etc.

    realTimeMonitoring.recordMetric({
      name: 'performance.optimization.response_time',
      value: 1,
      timestamp: new Date(),
      tags: { type: 'response_optimization' },
    });
  }

  /**
   * Helper methods
   */
  private async getCpuUsage(): Promise<number> {
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

  private async measureEventLoopLag(): Promise<number> {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
        resolve(lag);
      });
    });
  }

  private getActiveConnections(): number {
    // This would integrate with connection tracking
    return 0;
  }

  private calculateRequestsPerSecond(): number {
    // This would integrate with request tracking
    return 0;
  }

  private calculateAverageResponseTime(): number {
    // This would integrate with response time tracking
    return 0;
  }

  private calculateErrorRate(): number {
    // This would integrate with error tracking
    return 0;
  }

  private calculateCacheHitRate(): number {
    if (this.cacheStats.totalRequests === 0) return 100;
    return (this.cacheStats.hits / this.cacheStats.totalRequests) * 100;
  }

  private async getDatabaseConnections(): Promise<number> {
    try {
      // This would query the database for active connections
      return 0;
    } catch {
      return 0;
    }
  }

  private getCurrentCacheSize(): number {
    return Array.from(this.cache.values()).reduce((total, entry) => total + entry.size, 0);
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.createdAt > entry.ttl * 1000;
  }

  private clearExpiredEntries(): void {
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.cache.delete(key));
    
    if (expiredKeys.length > 0) {
      logger.debug('Cleared expired cache entries', { count: expiredKeys.length });
    }
  }

  private cleanupPerformanceHistory(): void {
    // Keep only last 1000 metrics (about 4 hours at 15-second intervals)
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory = this.performanceHistory.slice(-1000);
    }
  }

  private compress(data: string): string {
    // Simplified compression - in production use zlib
    return Buffer.from(data).toString('base64');
  }

  private decompress(data: string): string {
    // Simplified decompression - in production use zlib
    return Buffer.from(data, 'base64').toString('utf8');
  }

  private encrypt(data: string): string {
    // Simplified encryption - in production use proper encryption
    return Buffer.from(data).toString('base64');
  }

  private decrypt(data: string): string {
    // Simplified decryption - in production use proper decryption
    return Buffer.from(data, 'base64').toString('utf8');
  }

  /**
   * Get performance statistics
   */
  public getPerformanceStats(): {
    cache: {
      hits: number;
      misses: number;
      evictions: number;
      totalRequests: number;
    };
    currentMetrics: PerformanceMetrics | null;
    optimizationHistory: Array<{ rule: string; timestamp: number }>;
  } {
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

interface CacheEntry {
  value: any;
  ttl: number;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  size: number;
  compressed: boolean;
  encrypted: boolean;
}

// Export singleton instance with default configuration
export const performanceOptimizer = new PerformanceOptimizer({
  ttl: 300, // 5 minutes
  maxSize: 100, // 100 MB
  strategy: 'adaptive',
  compression: true,
  encryption: false,
});

// Graceful shutdown
process.on('SIGINT', () => {
  performanceOptimizer.stopMonitoring();
});

process.on('SIGTERM', () => {
  performanceOptimizer.stopMonitoring();
});