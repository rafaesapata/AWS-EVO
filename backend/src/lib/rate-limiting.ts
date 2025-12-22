/**
 * Advanced Rate Limiting System
 * Provides multiple rate limiting strategies with Redis-like functionality
 */

import type { APIGatewayProxyResultV2 } from '../types/lambda.js';
import { tooManyRequests } from './response.js';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (event: any) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
}

/**
 * In-memory rate limiter with sliding window
 */
export class MemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private cleanupIntervalMs = 60000) {
    this.startCleanup();
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store) {
      if (now > entry.resetTime) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`Rate limiter cleanup: removed ${cleaned} expired entries`);
    }
  }

  async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    const now = Date.now();
    const resetTime = now + windowMs;
    
    let entry = this.store.get(key);
    
    if (!entry || now > entry.resetTime) {
      // Create new entry or reset expired entry
      entry = {
        count: 1,
        resetTime,
        firstRequest: now,
      };
      this.store.set(key, entry);
    } else {
      // Increment existing entry
      entry.count++;
    }

    const remaining = Math.max(0, entry.count);
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

    return {
      limit: 0, // Will be set by the rate limiter
      remaining,
      reset: Math.ceil(entry.resetTime / 1000),
      retryAfter: retryAfter > 0 ? retryAfter : undefined,
    };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  getStats(): { totalKeys: number; memoryUsage: number } {
    return {
      totalKeys: this.store.size,
      memoryUsage: JSON.stringify([...this.store.entries()]).length,
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

/**
 * Sliding window rate limiter
 */
export class SlidingWindowRateLimiter {
  private windows = new Map<string, number[]>();

  async increment(key: string, windowMs: number, maxRequests: number): Promise<RateLimitInfo> {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    let requests = this.windows.get(key) || [];
    
    // Remove old requests outside the window
    requests = requests.filter(timestamp => timestamp > windowStart);
    
    // Add current request
    requests.push(now);
    this.windows.set(key, requests);

    const remaining = Math.max(0, maxRequests - requests.length);
    const oldestRequest = requests[0];
    const resetTime = oldestRequest + windowMs;
    const retryAfter = requests.length >= maxRequests 
      ? Math.ceil((resetTime - now) / 1000)
      : undefined;

    return {
      limit: maxRequests,
      remaining,
      reset: Math.ceil(resetTime / 1000),
      retryAfter,
    };
  }

  async reset(key: string): Promise<void> {
    this.windows.delete(key);
  }
}

/**
 * Token bucket rate limiter
 */
export class TokenBucketRateLimiter {
  private buckets = new Map<string, { tokens: number; lastRefill: number }>();

  async increment(
    key: string, 
    capacity: number, 
    refillRate: number, 
    tokensRequested = 1
  ): Promise<RateLimitInfo> {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor((timePassed / 1000) * refillRate);
    
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    // Check if we have enough tokens
    if (bucket.tokens >= tokensRequested) {
      bucket.tokens -= tokensRequested;
      
      return {
        limit: capacity,
        remaining: bucket.tokens,
        reset: Math.ceil((now + ((capacity - bucket.tokens) / refillRate) * 1000) / 1000),
      };
    } else {
      // Not enough tokens
      const timeToRefill = ((tokensRequested - bucket.tokens) / refillRate) * 1000;
      
      return {
        limit: capacity,
        remaining: 0,
        reset: Math.ceil((now + timeToRefill) / 1000),
        retryAfter: Math.ceil(timeToRefill / 1000),
      };
    }
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }
}

/**
 * Main rate limiter class
 */
export class RateLimiter {
  private limiter: MemoryRateLimiter | SlidingWindowRateLimiter | TokenBucketRateLimiter;

  constructor(
    private config: RateLimitConfig,
    strategy: 'memory' | 'sliding' | 'token' = 'sliding'
  ) {
    switch (strategy) {
      case 'memory':
        this.limiter = new MemoryRateLimiter();
        break;
      case 'sliding':
        this.limiter = new SlidingWindowRateLimiter();
        break;
      case 'token':
        this.limiter = new TokenBucketRateLimiter();
        break;
      default:
        this.limiter = new SlidingWindowRateLimiter();
    }
  }

  async checkLimit(event: any): Promise<{
    allowed: boolean;
    info: RateLimitInfo;
    response?: APIGatewayProxyResultV2;
  }> {
    const key = this.generateKey(event);
    
    let info: RateLimitInfo;
    
    if (this.limiter instanceof TokenBucketRateLimiter) {
      info = await this.limiter.increment(key, this.config.maxRequests, this.config.maxRequests / (this.config.windowMs / 1000));
    } else if (this.limiter instanceof SlidingWindowRateLimiter) {
      info = await this.limiter.increment(key, this.config.windowMs, this.config.maxRequests);
    } else {
      info = await this.limiter.increment(key, this.config.windowMs);
      info.limit = this.config.maxRequests;
      info.remaining = Math.max(0, this.config.maxRequests - info.remaining);
    }

    const allowed = info.remaining > 0 || (this.limiter instanceof TokenBucketRateLimiter && !info.retryAfter);

    if (!allowed) {
      const origin = event.headers?.origin || event.headers?.Origin;
      const response = tooManyRequests(
        this.config.message || 'Too many requests',
        info.retryAfter,
        origin
      );

      // Add rate limit headers
      const rateLimitHeaders = this.generateHeaders(info);
      response.headers = { ...response.headers, ...rateLimitHeaders };

      return { allowed: false, info, response };
    }

    return { allowed: true, info };
  }

  private generateKey(event: any): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(event);
    }

    // Default key generation strategy
    const ip = event.requestContext?.identity?.sourceIp || 'unknown';
    const userAgent = event.headers?.['user-agent'] || event.headers?.['User-Agent'] || 'unknown';
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    
    if (userId) {
      return `user:${userId}`;
    }
    
    return `ip:${ip}:${Buffer.from(userAgent).toString('base64').slice(0, 10)}`;
  }

  private generateHeaders(info: RateLimitInfo): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.config.standardHeaders !== false) {
      headers['RateLimit-Limit'] = info.limit.toString();
      headers['RateLimit-Remaining'] = info.remaining.toString();
      headers['RateLimit-Reset'] = info.reset.toString();
    }

    if (this.config.legacyHeaders !== false) {
      headers['X-RateLimit-Limit'] = info.limit.toString();
      headers['X-RateLimit-Remaining'] = info.remaining.toString();
      headers['X-RateLimit-Reset'] = info.reset.toString();
    }

    if (info.retryAfter) {
      headers['Retry-After'] = info.retryAfter.toString();
    }

    return headers;
  }

  async reset(event: any): Promise<void> {
    const key = this.generateKey(event);
    await this.limiter.reset(key);
  }
}

/**
 * Predefined rate limit configurations
 */
export const RATE_LIMIT_CONFIGS = {
  // Strict limits for authentication endpoints
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    message: 'Too many authentication attempts',
  },
  
  // API endpoints
  API: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'API rate limit exceeded',
  },
  
  // Security scans (resource intensive)
  SECURITY_SCAN: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
    message: 'Security scan rate limit exceeded',
  },
  
  // Cost analysis
  COST_ANALYSIS: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
    message: 'Cost analysis rate limit exceeded',
  },
  
  // File uploads
  UPLOAD: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    message: 'Upload rate limit exceeded',
  },
  
  // Public endpoints
  PUBLIC: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000,
    message: 'Rate limit exceeded',
  },
} as const;

/**
 * Rate limiting middleware
 */
export function withRateLimit(
  handler: (event: any, context: any) => Promise<APIGatewayProxyResultV2>,
  config: RateLimitConfig,
  strategy: 'memory' | 'sliding' | 'token' = 'sliding'
) {
  const rateLimiter = new RateLimiter(config, strategy);

  return async (event: any, context: any): Promise<APIGatewayProxyResultV2> => {
    const { allowed, info, response } = await rateLimiter.checkLimit(event);

    if (!allowed && response) {
      return response;
    }

    // Execute the handler
    const result = await handler(event, context);

    // Add rate limit headers to successful responses
    const rateLimitHeaders = rateLimiter['generateHeaders'](info);
    result.headers = { ...result.headers, ...rateLimitHeaders };

    return result;
  };
}

/**
 * Adaptive rate limiting based on system load
 */
export class AdaptiveRateLimiter extends RateLimiter {
  private systemLoad = 0;
  private loadCheckInterval?: NodeJS.Timeout;

  constructor(config: RateLimitConfig, strategy: 'memory' | 'sliding' | 'token' = 'sliding') {
    super(config, strategy);
    this.startLoadMonitoring();
  }

  private startLoadMonitoring(): void {
    this.loadCheckInterval = setInterval(() => {
      // Simple load calculation based on memory usage
      const memUsage = process.memoryUsage();
      this.systemLoad = memUsage.heapUsed / memUsage.heapTotal;
    }, 5000);
  }

  async checkLimit(event: any): Promise<{
    allowed: boolean;
    info: RateLimitInfo;
    response?: APIGatewayProxyResultV2;
  }> {
    // Adjust limits based on system load
    const loadFactor = Math.max(0.1, 1 - this.systemLoad);
    
    // Create a temporary rate limiter with adjusted config
    const adjustedConfig = {
      ...(this as any).config,
      maxRequests: Math.floor((this as any).config.maxRequests * loadFactor),
    };
    
    const tempLimiter = new RateLimiter(adjustedConfig, 'sliding');
    return tempLimiter.checkLimit(event);
  }

  destroy(): void {
    if (this.loadCheckInterval) {
      clearInterval(this.loadCheckInterval);
    }
  }
}

/**
 * Distributed rate limiter (for multi-instance deployments)
 */
export class DistributedRateLimiter {
  private redis: any = null;
  private redisConfig: {
    host: string;
    port: number;
    password?: string;
    retryDelayOnFailover: number;
    maxRetriesPerRequest: number;
  };

  constructor(
    private config: RateLimitConfig,
    private redisClient?: any // Redis client would be injected
  ) {
    this.redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    };
  }

  private async getRedisClient() {
    if (this.redisClient) {
      return this.redisClient;
    }

    if (!this.redis) {
      try {
        // Dynamic import to avoid issues if Redis is not available
        const Redis = (await import('ioredis')).default;
        this.redis = new Redis(this.redisConfig);
        
        // Test connection
        await this.redis.ping();
      } catch (error) {
        throw new Error(`Redis connection failed: ${(error as Error).message}`);
      }
    }
    return this.redis;
  }

  async checkLimit(event: any): Promise<{
    allowed: boolean;
    info: RateLimitInfo;
    response?: APIGatewayProxyResultV2;
  }> {
    if (!this.redisClient) {
      // Fallback to memory limiter
      const memoryLimiter = new RateLimiter(this.config);
      return memoryLimiter.checkLimit(event);
    }

    // Redis-based implementation
    try {
      const redis = await this.getRedisClient();
      const pipeline = redis.pipeline();
      const now = Date.now();
      const window = this.config.windowMs;
      const limit = this.config.maxRequests;
      const key = `rate_limit:${event.ip}:${event.path || 'default'}`;

      // Remove expired entries
      pipeline.zremrangebyscore(key, 0, now - window);
      
      // Count current requests
      pipeline.zcard(key);
      
      // Add current request
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      
      // Set expiration
      pipeline.expire(key, Math.ceil(window / 1000));

      const results = await pipeline.exec();
      const count = (results?.[1]?.[1] as number) || 0;

      return {
        allowed: count < limit,
        info: {
          limit,
          remaining: Math.max(0, limit - count - 1),
          reset: Math.ceil((now + window) / 1000),
        },
      };
    } catch (error) {
      // Fallback to memory limiter on Redis failure
      console.warn('Redis rate limiting failed, falling back to memory', { error: (error as Error).message });
      const memoryLimiter = new RateLimiter(this.config);
      return memoryLimiter.checkLimit(event);
    }
  }
}