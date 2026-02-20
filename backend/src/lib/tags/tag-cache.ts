/**
 * Tag Cache Manager — Smart Resource Tagging
 * Redis-backed caching with graceful degradation
 */

import { RedisCacheManager } from '../redis-cache.js';
import { logger } from '../logger.js';

const cache = new RedisCacheManager();

// TTLs per NFR-6
const TTL = {
  TAG_LIST: 300,        // 5 min
  USAGE_COUNT: 300,     // 5 min
  SUGGESTIONS: 120,     // 2 min
  COVERAGE: 600,        // 10 min
  COST_REPORT: 3600,    // 1 hour
  SECURITY_REPORT: 900, // 15 min
} as const;

// ============================================================================
// GET / SET
// ============================================================================

export async function getCachedTagList(orgId: string, hash: string): Promise<any | null> {
  try {
    return await cache.get(`tags:list:${orgId}:${hash}`);
  } catch (err: any) {
    logger.warn('Cache get error (tag list)', { orgId, error: err.message });
    return null;
  }
}

export async function setCachedTagList(orgId: string, hash: string, data: any): Promise<void> {
  try {
    await cache.set(`tags:list:${orgId}:${hash}`, data, { ttl: TTL.TAG_LIST });
  } catch (err: any) {
    logger.warn('Cache set error (tag list)', { orgId, error: err.message });
  }
}

export async function getCachedUsageCount(orgId: string, tagId: string): Promise<number | null> {
  try {
    return await cache.get<number>(`tags:usage:${orgId}:${tagId}`);
  } catch (err: any) {
    logger.warn('Cache get error (usage count)', { orgId, tagId, error: err.message });
    return null;
  }
}

export async function setCachedUsageCount(orgId: string, tagId: string, count: number): Promise<void> {
  try {
    await cache.set(`tags:usage:${orgId}:${tagId}`, count, { ttl: TTL.USAGE_COUNT });
  } catch (err: any) {
    logger.warn('Cache set error (usage count)', { orgId, tagId, error: err.message });
  }
}

export async function getCachedSuggestions(orgId: string, resourceType: string, account: string): Promise<any | null> {
  try {
    return await cache.get(`tags:suggestions:${orgId}:${resourceType}:${account}`);
  } catch (err: any) {
    logger.warn('Cache get error (suggestions)', { orgId, error: err.message });
    return null;
  }
}

export async function setCachedSuggestions(orgId: string, resourceType: string, account: string, data: any): Promise<void> {
  try {
    await cache.set(`tags:suggestions:${orgId}:${resourceType}:${account}`, data, { ttl: TTL.SUGGESTIONS });
  } catch (err: any) {
    logger.warn('Cache set error (suggestions)', { orgId, error: err.message });
  }
}

export async function getCachedCoverage(orgId: string): Promise<any | null> {
  try {
    return await cache.get(`tags:coverage:${orgId}`);
  } catch (err: any) {
    logger.warn('Cache get error (coverage)', { orgId, error: err.message });
    return null;
  }
}

export async function setCachedCoverage(orgId: string, data: any): Promise<void> {
  try {
    await cache.set(`tags:coverage:${orgId}`, data, { ttl: TTL.COVERAGE });
  } catch (err: any) {
    logger.warn('Cache set error (coverage)', { orgId, error: err.message });
  }
}

export async function getCachedCostReport(orgId: string, tagId: string, dateRange: string): Promise<any | null> {
  try {
    return await cache.get(`tags:report:cost:${orgId}:${tagId}:${dateRange}`);
  } catch (err: any) {
    logger.warn('Cache get error (cost report)', { orgId, tagId, error: err.message });
    return null;
  }
}

export async function setCachedCostReport(orgId: string, tagId: string, dateRange: string, data: any): Promise<void> {
  try {
    await cache.set(`tags:report:cost:${orgId}:${tagId}:${dateRange}`, data, { ttl: TTL.COST_REPORT });
  } catch (err: any) {
    logger.warn('Cache set error (cost report)', { orgId, tagId, error: err.message });
  }
}

// ============================================================================
// INVALIDATION
// ============================================================================

export async function invalidateTagList(orgId: string): Promise<void> {
  try {
    await cache.deletePattern(`tags:list:${orgId}:*`);
  } catch (err: any) {
    logger.warn('Cache invalidation error (tag list)', { orgId, error: err.message });
  }
}

export async function invalidateUsageCount(orgId: string, tagId: string): Promise<void> {
  try {
    await cache.delete(`tags:usage:${orgId}:${tagId}`);
  } catch (err: any) {
    logger.warn('Cache invalidation error (usage count)', { orgId, tagId, error: err.message });
  }
}

export async function invalidateSuggestions(orgId: string): Promise<void> {
  try {
    await cache.deletePattern(`tags:suggestions:${orgId}:*`);
  } catch (err: any) {
    logger.warn('Cache invalidation error (suggestions)', { orgId, error: err.message });
  }
}

export async function invalidateCoverage(orgId: string): Promise<void> {
  try {
    await cache.delete(`tags:coverage:${orgId}`);
  } catch (err: any) {
    logger.warn('Cache invalidation error (coverage)', { orgId, error: err.message });
  }
}

export async function invalidateOnAssignmentChange(orgId: string, tagId: string): Promise<void> {
  await Promise.all([
    invalidateUsageCount(orgId, tagId),
    invalidateSuggestions(orgId),
    invalidateCoverage(orgId),
    invalidateTagList(orgId),
  ]);
  // Also invalidate reports for this tag
  try {
    await cache.deletePattern(`tags:report:cost:${orgId}:${tagId}:*`);
    await cache.deletePattern(`tags:report:security:${orgId}:*`);
  } catch (err: any) {
    logger.warn('Cache invalidation error (reports)', { orgId, tagId, error: err.message });
  }
}
