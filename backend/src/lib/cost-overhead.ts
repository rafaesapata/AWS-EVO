/**
 * Cost Overhead Service
 * 
 * Centralized service for fetching, caching, and applying cost overhead
 * percentages per organization. Overhead is applied at the API response
 * layer without modifying persisted data.
 */

import { getPrismaClient } from './database.js';
import { cacheManager } from './redis-cache.js';
import { logger } from './logger.js';

// Cache key prefix and TTL
const OVERHEAD_CACHE_PREFIX = 'overhead';
const OVERHEAD_CACHE_TTL = 300; // 5 minutes

/**
 * Configuration for which fields in a response object should receive overhead
 */
export interface OverheadFieldConfig {
  /** Path in the object (e.g. "costs", "summary", "financial") */
  path: string;
  /** Type of the field at that path */
  type: 'array' | 'object' | 'value';
  /** Numeric fields within the array items or object to multiply */
  fields?: string[];
}

/**
 * Get the overhead percentage for an organization.
 * Uses Redis cache with fallback to DB, and fallback to 0.00 on any error.
 */
export async function getOverheadPercentage(organizationId: string): Promise<number> {
  const cacheKey = organizationId;

  try {
    // Try Redis cache first
    const cached = await cacheManager.get<string>(cacheKey, { prefix: OVERHEAD_CACHE_PREFIX });
    if (cached !== null) {
      return parseFloat(cached);
    }
  } catch (err) {
    logger.warn('[CostOverhead] Redis get error, falling back to DB', {
      organizationId,
      error: (err as Error).message,
    });
  }

  // Cache miss or Redis error — query DB
  try {
    const prisma = getPrismaClient();
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { cost_overhead_percentage: true },
    });

    const percentage = org?.cost_overhead_percentage != null
      ? Number(org.cost_overhead_percentage)
      : 0;

    // Populate cache (fire-and-forget)
    cacheManager.set(cacheKey, String(percentage), {
      prefix: OVERHEAD_CACHE_PREFIX,
      ttl: OVERHEAD_CACHE_TTL,
    }).catch(() => {});

    return percentage;
  } catch (err) {
    logger.warn('[CostOverhead] DB query error, defaulting to 0', {
      organizationId,
      error: (err as Error).message,
    });
    return 0;
  }
}

/**
 * Apply overhead to a response object based on field configurations.
 * Short-circuits when overhead is 0 (no transformation, no cost).
 */
export async function applyOverhead<T extends Record<string, any>>(
  organizationId: string,
  data: T,
  fieldConfigs: OverheadFieldConfig[]
): Promise<T> {
  const percentage = await getOverheadPercentage(organizationId);

  // Short-circuit: no overhead configured
  if (percentage === 0) return data;

  const multiplier = 1 + percentage / 100;

  // Deep clone to avoid mutating original (preserves cache integrity)
  const result = JSON.parse(JSON.stringify(data)) as T;

  for (const config of fieldConfigs) {
    const target = getNestedValue(result, config.path);
    if (target === undefined || target === null) continue;

    if (config.type === 'array' && Array.isArray(target) && config.fields) {
      applyMultiplierToArray(target, config.fields, multiplier);
    } else if (config.type === 'object' && typeof target === 'object' && config.fields) {
      applyMultiplierToObject(target, config.fields, multiplier);
    } else if (config.type === 'value') {
      setNestedValue(result, config.path, roundTwo(getNestedValue(result, config.path) * multiplier));
    }
  }

  return result;
}

/**
 * Apply multiplier to numeric fields in each item of an array.
 * Supports dot notation for nested fields (e.g. "potentialSavings.monthly").
 * Mutates in place.
 */
export function applyMultiplierToArray<T extends Record<string, any>>(
  items: T[],
  fields: string[],
  multiplier: number
): T[] {
  for (const item of items) {
    for (const field of fields) {
      const val = getNestedValue(item, field);
      if (typeof val === 'number') {
        setNestedValue(item, field, roundTwo(val * multiplier));
      }
    }
  }
  return items;
}

/**
 * Apply multiplier to numeric fields in an object.
 * Mutates in place.
 */
export function applyMultiplierToObject<T extends Record<string, any>>(
  obj: T,
  fields: string[],
  multiplier: number
): T {
  for (const field of fields) {
    const val = getNestedValue(obj, field);
    if (typeof val === 'number') {
      setNestedValue(obj, field, roundTwo(val * multiplier));
    }
  }
  return obj;
}

/**
 * Invalidate overhead cache and cost SWR caches for an organization.
 */
export async function invalidateOverheadCache(organizationId: string): Promise<void> {
  try {
    // Delete overhead cache
    await cacheManager.delete(organizationId, { prefix: OVERHEAD_CACHE_PREFIX });

    // Delete all cost SWR caches for this organization
    await cacheManager.deletePattern(`*${organizationId}*`, { prefix: 'cost' });

    // Also invalidate dashboard caches
    await cacheManager.deletePattern(`*${organizationId}*`, { prefix: 'dash' });
  } catch (err) {
    logger.warn('[CostOverhead] Cache invalidation error (non-fatal)', {
      organizationId,
      error: (err as Error).message,
    });
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Get a nested value from an object using dot notation.
 * e.g. getNestedValue(obj, "summary.totalCost")
 * Empty string returns the object itself (root level).
 */
function getNestedValue(obj: any, path: string): any {
  if (path === '') return obj;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Set a nested value in an object using dot notation.
 * Empty string path is not supported for set (no-op).
 */
function setNestedValue(obj: any, path: string, value: any): void {
  if (path === '') return;
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === null || current[parts[i]] === undefined) return;
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}
