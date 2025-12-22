/**
 * Rate Limiting System
 * Advanced rate limiting with multiple strategies and Redis backend
 */

import { cacheManager } from '../backend/src/lib/redis-cache';
import { logger } from './logging';
import { metricsCollector } from './metrics-collector';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: any) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  onLimitReached?: (req: any, rateLimitInfo: RateLimitInfo) => void;
  message?: string; // Custom error message
  standardHeaders?: boolean; // Send standard rate limit headers
  legacyHeaders?: boolean; // Send legacy X-RateLimit headers
}

export interface RateLimitInfo {
  totalHits: number;
  totalRequests: number;
  resetTime: Date;
  remainingRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  rateLimitInfo: RateLimitInfo;
  retryAfter?: number; // Seconds until next request allowed
}

export enum RateLimitStrategy {
  FIXED_WINDOW = 'fixed_window',
  SLIDING_WINDOW = 'sliding_window',
  TOKEN_BUCKET = 'token_bucket',
  LEAKY_BUCKET = 'leaky_bucket',
}

/**
 * Base Rate Limiter
 */
export abstract class BaseRateLimiter {
  protected config: RateLimitConfig;
  protected strategy: RateLimitStrategy;

  constructor(config: RateLimitConfig, strategy: RateLimitStrategy) {
    this.config = config;
    this.strategy = strategy;
  }

  abstract checkLimit(key: string): Promise<RateLimitResult>;
  abstract reset(key: string): Promise<void>;

  protected generateKey(req: any): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(req);
    }

    // Default key generation based on IP and user
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const userId = req.user?.id || req.userId || 'anonymous';
    
    return `${this.strategy}:${ip}:${userId}`;
  }

  protected createRateLimitInfo(
    totalHits: number,
    windowMs: number,
    maxRequests: number,
    resetTime: Date
  ): RateLimitInfo {
    return {
      totalHits,
      totalRequests: maxRequests,
      resetTime,
      remainingRequests: Math.max(0, maxRequests - totalHits),
      windowMs,
    };
  }
}

/**
 * Fixed Window Rate Limiter
 */
export class FixedWindowRateLimiter extends BaseRateLimiter {
  constructor(config: RateLimitConfig) {
    super(config, RateLimitStrategy.FIXED_WINDOW);
  }

  async checkLimit(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / this.config.windowMs) * this.config.windowMs;
    const windowKey = `${key}:${windowStart}`;

    try {
      // Increment counter
      const currentCount = await cacheManager.increment(windowKey, 1, {
        ttl: Math.ceil(this.config.windowMs / 1000),
        prefix: 'rate_limit'
      });

      const resetTime = new Date(windowStart + this.config.windowMs);
      const rateLimitInfo = this.createRateLimitInfo(
        currentCount,
        this.config.windowMs,
        this.config.maxRequests,
        resetTime
      );

      const allowed = currentCount <= this.config.maxRequests;

      if (!allowed) {
        metricsCollector.record('rate_limit_exceeded', 1, {
          strategy: this.strategy,
          key: key.split(':')[0] // Don't log full key for privacy
        });

        logger.warn('Rate limit exceeded', {
          key: key.split(':')[0],
          currentCount,
          maxRequests: this.config.maxRequests,
          strategy: this.strategy
        });
      }

      return {
        allowed,
        rateLimitInfo,
        retryAfter: allowed ? undefined : Math.ceil((resetTime.getTime() - now) / 1000)
      };

    } catch (error) {
      logger.error('Rate limit check failed', error as Error, { key });
      
      // Fail open - allow request if rate limiting fails
      return {
        allowed: true,
        rateLimitInfo: this.createRateLimitInfo(0, this.config.windowMs, this.config.maxRequests, new Date())
      };
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await cacheManager.deletePattern(`${key}:*`, { prefix: 'rate_limit' });
    } catch (error) {
      logger.error('Failed to reset rate limit', error as Error, { key });
    }
  }
}

/**
 * Sliding Window Rate Limiter
 */
export class SlidingWindowRateLimiter extends BaseRateLimiter {
  constructor(config: RateLimitConfig) {
    super(config, RateLimitStrategy.SLIDING_WINDOW);
  }

  async checkLimit(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const listKey = `${key}:requests`;

    try {
      // Add current timestamp to sorted set
      await cacheManager.redis.zadd(listKey, now, `${now}-${Math.random()}`);
      
      // Remove old entries
      await cacheManager.redis.zremrangebyscore(listKey, 0, windowStart);
      
      // Count current requests in window
      const currentCount = await cacheManager.redis.zcard(listKey);
      
      // Set expiration
      await cacheManager.redis.expire(listKey, Math.ceil(this.config.windowMs / 1000));

      const resetTime = new Date(now + this.config.windowMs);
      const rateLimitInfo = this.createRateLimitInfo(
        currentCount,
        this.config.windowMs,
        this.config.maxRequests,
        resetTime
      );

      const allowed = currentCount <= this.config.maxRequests;

      if (!allowed) {
        // Remove the request we just added since it's not allowed
        await cacheManager.redis.zremrangebyrank(listKey, -1, -1);
        
        metricsCollector.record('rate_limit_exceeded', 1, {
          strategy: this.strategy,
          key: key.split(':')[0]
        });
      }

      return {
        allowed,
        rateLimitInfo,
        retryAfter: allowed ? undefined : Math.ceil(this.config.windowMs / 1000)
      };

    } catch (error) {
      logger.error('Sliding window rate limit check failed', error as Error, { key });
      
      return {
        allowed: true,
        rateLimitInfo: this.createRateLimitInfo(0, this.config.windowMs, this.config.maxRequests, new Date())
      };
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await cacheManager.delete(`${key}:requests`, { prefix: 'rate_limit' });
    } catch (error) {
      logger.error('Failed to reset sliding window rate limit', error as Error, { key });
    }
  }
}

/**
 * Token Bucket Rate Limiter
 */
export class TokenBucketRateLimiter extends BaseRateLimiter {
  private refillRate: number; // Tokens per second
  private bucketSize: number;

  constructor(config: RateLimitConfig & { refillRate?: number }) {
    super(config, RateLimitStrategy.TOKEN_BUCKET);
    this.refillRate = config.refillRate || config.maxRequests / (config.windowMs / 1000);
    this.bucketSize = config.maxRequests;
  }

  async checkLimit(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const bucketKey = `${key}:bucket`;

    try {
      // Get current bucket state
      const bucketData = await cacheManager.get<{
        tokens: number;
        lastRefill: number;
      }>(bucketKey, { prefix: 'rate_limit' });

      let tokens = this.bucketSize;
      let lastRefill = now;

      if (bucketData) {
        const timePassed = (now - bucketData.lastRefill) / 1000;
        const tokensToAdd = Math.floor(timePassed * this.refillRate);
        
        tokens = Math.min(this.bucketSize, bucketData.tokens + tokensToAdd);
        lastRefill = bucketData.lastRefill;
      }

      const allowed = tokens > 0;
      
      if (allowed) {
        tokens -= 1;
      }

      // Update bucket state
      await cacheManager.set(bucketKey, {
        tokens,
        lastRefill: now
      }, {
        prefix: 'rate_limit',
        ttl: Math.ceil(this.config.windowMs / 1000)
      });

      const resetTime = new Date(now + ((this.bucketSize - tokens) / this.refillRate) * 1000);
      const rateLimitInfo = this.createRateLimitInfo(
        this.bucketSize - tokens,
        this.config.windowMs,
        this.config.maxRequests,
        resetTime
      );

      if (!allowed) {
        metricsCollector.record('rate_limit_exceeded', 1, {
          strategy: this.strategy,
          key: key.split(':')[0]
        });
      }

      return {
        allowed,
        rateLimitInfo,
        retryAfter: allowed ? undefined : Math.ceil((1 / this.refillRate))
      };

    } catch (error) {
      logger.error('Token bucket rate limit check failed', error as Error, { key });
      
      return {
        allowed: true,
        rateLimitInfo: this.createRateLimitInfo(0, this.config.windowMs, this.config.maxRequests, new Date())
      };
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await cacheManager.delete(`${key}:bucket`, { prefix: 'rate_limit' });
    } catch (error) {
      logger.error('Failed to reset token bucket rate limit', error as Error, { key });
    }
  }
}

/**
 * Rate Limit Manager
 */
export class RateLimitManager {
  private limiters: Map<string, BaseRateLimiter> = new Map();

  createLimiter(
    name: string,
    config: RateLimitConfig,
    strategy: RateLimitStrategy = RateLimitStrategy.FIXED_WINDOW
  ): BaseRateLimiter {
    let limiter: BaseRateLimiter;

    switch (strategy) {
      case RateLimitStrategy.SLIDING_WINDOW:
        limiter = new SlidingWindowRateLimiter(config);
        break;
      case RateLimitStrategy.TOKEN_BUCKET:
        limiter = new TokenBucketRateLimiter(config);
        break;
      case RateLimitStrategy.FIXED_WINDOW:
      default:
        limiter = new FixedWindowRateLimiter(config);
        break;
    }

    this.limiters.set(name, limiter);
    return limiter;
  }

  getLimiter(name: string): BaseRateLimiter | undefined {
    return this.limiters.get(name);
  }

  async checkLimit(limiterName: string, req: any): Promise<RateLimitResult> {
    const limiter = this.getLimiter(limiterName);
    if (!limiter) {
      throw new Error(`Rate limiter '${limiterName}' not found`);
    }

    const key = limiter['generateKey'](req);
    return limiter.checkLimit(key);
  }

  async resetLimit(limiterName: string, req: any): Promise<void> {
    const limiter = this.getLimiter(limiterName);
    if (!limiter) {
      throw new Error(`Rate limiter '${limiterName}' not found`);
    }

    const key = limiter['generateKey'](req);
    await limiter.reset(key);
  }
}

// Global rate limit manager
export const rateLimitManager = new RateLimitManager();

// Predefined rate limiters
export const createDefaultRateLimiters = () => {
  // General API rate limit
  rateLimitManager.createLimiter('api', {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1000, // 1000 requests per 15 minutes
    message: 'Too many requests, please try again later',
    standardHeaders: true,
  });

  // Authentication rate limit
  rateLimitManager.createLimiter('auth', {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 login attempts per 15 minutes
    message: 'Too many login attempts, please try again later',
    keyGenerator: (req) => `auth:${req.ip}:${req.body?.email || 'unknown'}`,
  });

  // Security scan rate limit
  rateLimitManager.createLimiter('security-scan', {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10, // 10 scans per hour
    message: 'Too many security scans, please try again later',
    keyGenerator: (req) => `scan:${req.user?.organizationId || req.ip}`,
  }, RateLimitStrategy.SLIDING_WINDOW);

  // Cost analysis rate limit
  rateLimitManager.createLimiter('cost-analysis', {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50, // 50 analyses per hour
    message: 'Too many cost analysis requests, please try again later',
    keyGenerator: (req) => `cost:${req.user?.organizationId || req.ip}`,
  }, RateLimitStrategy.TOKEN_BUCKET);

  // File upload rate limit
  rateLimitManager.createLimiter('upload', {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100, // 100 uploads per hour
    message: 'Too many file uploads, please try again later',
    keyGenerator: (req) => `upload:${req.user?.id || req.ip}`,
  });

  // Password reset rate limit
  rateLimitManager.createLimiter('password-reset', {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3, // 3 password reset attempts per hour
    message: 'Too many password reset attempts, please try again later',
    keyGenerator: (req) => `pwd-reset:${req.ip}:${req.body?.email || 'unknown'}`,
  });
};

// Express middleware
export function createRateLimitMiddleware(limiterName: string) {
  return async (req: any, res: any, next: any) => {
    try {
      const result = await rateLimitManager.checkLimit(limiterName, req);
      
      // Set rate limit headers
      const limiter = rateLimitManager.getLimiter(limiterName);
      if (limiter && limiter['config'].standardHeaders) {
        res.set({
          'RateLimit-Limit': result.rateLimitInfo.totalRequests.toString(),
          'RateLimit-Remaining': result.rateLimitInfo.remainingRequests.toString(),
          'RateLimit-Reset': result.rateLimitInfo.resetTime.toISOString(),
        });
      }

      if (limiter && limiter['config'].legacyHeaders) {
        res.set({
          'X-RateLimit-Limit': result.rateLimitInfo.totalRequests.toString(),
          'X-RateLimit-Remaining': result.rateLimitInfo.remainingRequests.toString(),
          'X-RateLimit-Reset': Math.ceil(result.rateLimitInfo.resetTime.getTime() / 1000).toString(),
        });
      }

      if (!result.allowed) {
        if (result.retryAfter) {
          res.set('Retry-After', result.retryAfter.toString());
        }

        const config = limiter?.['config'];
        if (config?.onLimitReached) {
          config.onLimitReached(req, result.rateLimitInfo);
        }

        return res.status(429).json({
          error: 'Too Many Requests',
          message: config?.message || 'Rate limit exceeded',
          retryAfter: result.retryAfter,
          rateLimitInfo: result.rateLimitInfo,
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limiting middleware error', error as Error);
      // Fail open - allow request if rate limiting fails
      next();
    }
  };
}

// Lambda rate limiting
export async function checkLambdaRateLimit(
  event: any,
  limiterName: string
): Promise<{
  allowed: boolean;
  response?: any;
}> {
  try {
    const req = {
      ip: event.requestContext?.identity?.sourceIp || 'unknown',
      user: event.requestContext?.authorizer || null,
      body: event.body ? JSON.parse(event.body) : {},
    };

    const result = await rateLimitManager.checkLimit(limiterName, req);

    if (!result.allowed) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (result.retryAfter) {
        headers['Retry-After'] = result.retryAfter.toString();
      }

      return {
        allowed: false,
        response: {
          statusCode: 429,
          headers,
          body: JSON.stringify({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded',
            retryAfter: result.retryAfter,
            rateLimitInfo: result.rateLimitInfo,
          }),
        },
      };
    }

    return { allowed: true };
  } catch (error) {
    logger.error('Lambda rate limiting error', error as Error);
    // Fail open
    return { allowed: true };
  }
}

// React hook for client-side rate limiting awareness
export function useRateLimit(limiterName: string) {
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);
  const [isLimited, setIsLimited] = useState(false);

  const checkRateLimit = useCallback(async () => {
    try {
      const response = await fetch('/api/rate-limit-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limiter: limiterName }),
      });

      if (response.status === 429) {
        const data = await response.json();
        setRateLimitInfo(data.rateLimitInfo);
        setIsLimited(true);
      } else {
        setIsLimited(false);
        
        // Extract rate limit info from headers
        const limit = response.headers.get('RateLimit-Limit');
        const remaining = response.headers.get('RateLimit-Remaining');
        const reset = response.headers.get('RateLimit-Reset');

        if (limit && remaining && reset) {
          setRateLimitInfo({
            totalRequests: parseInt(limit),
            remainingRequests: parseInt(remaining),
            resetTime: new Date(reset),
            totalHits: parseInt(limit) - parseInt(remaining),
            windowMs: 0, // Not available from headers
          });
        }
      }
    } catch (error) {
      logger.error('Failed to check rate limit status', error as Error);
    }
  }, [limiterName]);

  return {
    rateLimitInfo,
    isLimited,
    checkRateLimit,
  };
}

// Initialize default rate limiters
createDefaultRateLimiters();