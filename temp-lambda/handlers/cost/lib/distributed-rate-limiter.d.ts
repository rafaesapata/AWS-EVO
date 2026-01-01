/**
 * Distributed Rate Limiter using Redis/ElastiCache
 * Provides consistent rate limiting across all Lambda instances
 *
 * Features:
 * - Sliding window algorithm for accurate rate limiting
 * - Automatic fallback to in-memory when Redis unavailable
 * - Per-user, per-organization, and per-IP rate limiting
 * - Configurable limits by operation type
 */
export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    blockDurationMs: number;
    keyPrefix?: string;
}
export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
    blocked?: boolean;
}
export interface RateLimitContext {
    userId?: string;
    organizationId?: string;
    ipAddress?: string;
    operationType: string;
}
export declare function cleanupInMemoryStore(): void;
/**
 * Check rate limit for a request
 * Uses Redis when available, falls back to in-memory
 */
export declare function checkRateLimit(context: RateLimitContext): Promise<RateLimitResult>;
/**
 * Check multiple rate limits (user + org + IP)
 */
export declare function checkMultipleRateLimits(context: RateLimitContext): Promise<RateLimitResult>;
/**
 * Reset rate limit for a key (admin function)
 */
export declare function resetRateLimit(context: RateLimitContext): Promise<void>;
/**
 * Get rate limit status without incrementing
 */
export declare function getRateLimitStatus(context: RateLimitContext): Promise<RateLimitResult & {
    currentCount: number;
}>;
//# sourceMappingURL=distributed-rate-limiter.d.ts.map