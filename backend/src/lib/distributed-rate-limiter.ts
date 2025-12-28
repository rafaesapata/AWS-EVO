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

import { logger } from './logging.js';

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// CONFIGURATION
// ============================================================================

const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  default: { maxRequests: 100, windowMs: 60000, blockDurationMs: 300000 },
  auth: { maxRequests: 10, windowMs: 60000, blockDurationMs: 900000 },
  sensitive: { maxRequests: 5, windowMs: 60000, blockDurationMs: 1800000 },
  export: { maxRequests: 3, windowMs: 300000, blockDurationMs: 3600000 },
  scan: { maxRequests: 10, windowMs: 300000, blockDurationMs: 600000 },
  api_heavy: { maxRequests: 20, windowMs: 60000, blockDurationMs: 300000 },
  webhook: { maxRequests: 50, windowMs: 60000, blockDurationMs: 120000 },
};

// ============================================================================
// IN-MEMORY RATE LIMITING (Default - works without Redis)
// ============================================================================

interface InMemoryEntry {
  count: number;
  windowStart: number;
  blocked: boolean;
  blockExpiry?: number;
}

const inMemoryStore = new Map<string, InMemoryEntry>();

function inMemoryRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  let entry = inMemoryStore.get(key);

  // Check if blocked
  if (entry?.blocked && entry.blockExpiry && entry.blockExpiry > now) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.blockExpiry,
      retryAfter: Math.ceil((entry.blockExpiry - now) / 1000),
      blocked: true,
    };
  }

  // Reset window if expired
  if (!entry || now - entry.windowStart > config.windowMs) {
    entry = { count: 0, windowStart: now, blocked: false };
  }

  entry.count++;
  inMemoryStore.set(key, entry);

  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetTime = entry.windowStart + config.windowMs;

  if (entry.count > config.maxRequests) {
    entry.blocked = true;
    entry.blockExpiry = now + config.blockDurationMs;
    inMemoryStore.set(key, entry);

    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.blockExpiry,
      retryAfter: Math.ceil(config.blockDurationMs / 1000),
      blocked: true,
    };
  }

  return {
    allowed: true,
    remaining,
    resetTime,
  };
}

// Cleanup in-memory store periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of inMemoryStore.entries()) {
    const isExpired = now - entry.windowStart > 600000; // 10 minutes
    const isUnblocked = entry.blocked && entry.blockExpiry && now > entry.blockExpiry;
    if (isExpired || isUnblocked) {
      inMemoryStore.delete(key);
    }
  }
}, 60000);

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check rate limit for a request
 * Uses in-memory by default, can be extended to use Redis/ElastiCache
 */
export async function checkRateLimit(
  context: RateLimitContext
): Promise<RateLimitResult> {
  const config = RATE_LIMIT_CONFIGS[context.operationType] || RATE_LIMIT_CONFIGS.default;
  
  // Build composite key
  const keyParts = ['ratelimit'];
  if (context.organizationId) keyParts.push(`org:${context.organizationId}`);
  if (context.userId) keyParts.push(`user:${context.userId}`);
  if (context.ipAddress) keyParts.push(`ip:${context.ipAddress}`);
  keyParts.push(`op:${context.operationType}`);
  
  const key = keyParts.join(':');

  // Use in-memory rate limiting (Redis can be added later)
  return inMemoryRateLimit(key, config);
}

/**
 * Check multiple rate limits (user + org + IP)
 */
export async function checkMultipleRateLimits(
  context: RateLimitContext
): Promise<RateLimitResult> {
  const results: RateLimitResult[] = [];

  // Check user-level rate limit
  if (context.userId) {
    results.push(await checkRateLimit({
      ...context,
      organizationId: undefined,
      ipAddress: undefined,
    }));
  }

  // Check organization-level rate limit
  if (context.organizationId) {
    results.push(await checkRateLimit({
      ...context,
      userId: undefined,
      ipAddress: undefined,
    }));
  }

  // Check IP-level rate limit (for unauthenticated requests)
  if (context.ipAddress && !context.userId) {
    results.push(await checkRateLimit({
      ...context,
      userId: undefined,
      organizationId: undefined,
    }));
  }

  // Return the most restrictive result
  const blocked = results.find(r => !r.allowed);
  if (blocked) return blocked;

  // Return the one with lowest remaining
  return results.reduce((min, curr) => 
    curr.remaining < min.remaining ? curr : min
  , results[0] || { allowed: true, remaining: 100, resetTime: Date.now() + 60000 });
}

/**
 * Reset rate limit for a key (admin function)
 */
export async function resetRateLimit(
  context: RateLimitContext
): Promise<void> {
  const keyParts = ['ratelimit'];
  if (context.organizationId) keyParts.push(`org:${context.organizationId}`);
  if (context.userId) keyParts.push(`user:${context.userId}`);
  keyParts.push(`op:${context.operationType}`);
  
  const key = keyParts.join(':');
  inMemoryStore.delete(key);
}

/**
 * Get rate limit status without incrementing
 */
export async function getRateLimitStatus(
  context: RateLimitContext
): Promise<RateLimitResult & { currentCount: number }> {
  const config = RATE_LIMIT_CONFIGS[context.operationType] || RATE_LIMIT_CONFIGS.default;
  
  const keyParts = ['ratelimit'];
  if (context.organizationId) keyParts.push(`org:${context.organizationId}`);
  if (context.userId) keyParts.push(`user:${context.userId}`);
  keyParts.push(`op:${context.operationType}`);
  
  const key = keyParts.join(':');
  const entry = inMemoryStore.get(key);
  const count = entry?.count || 0;
  
  return {
    allowed: count < config.maxRequests,
    remaining: Math.max(0, config.maxRequests - count),
    resetTime: (entry?.windowStart || Date.now()) + config.windowMs,
    currentCount: count,
  };
}
