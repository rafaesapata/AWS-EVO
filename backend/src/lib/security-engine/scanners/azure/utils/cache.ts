/**
 * Azure Scanner Resource Cache
 * 
 * Provides in-memory caching for Azure resources during a scan session.
 * This prevents duplicate API calls when multiple scanners need the same resources.
 */

import { logger } from '../../../../logging.js';

/** Default cache TTL: 5 minutes */
const DEFAULT_CACHE_TTL_MS = 300_000;

/** Maximum cache entries to prevent unbounded memory growth */
const MAX_CACHE_ENTRIES = 500;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

export class AzureScannerCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs = DEFAULT_CACHE_TTL_MS) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Get cached data or fetch and cache it
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const data = await fetcher();
    this.set(key, data, ttlMs);
    return data;
  }

  /**
   * Get cached data if available and not expired
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  /**
   * Set cached data with optional TTL override.
   * Evicts oldest entries if cache exceeds MAX_CACHE_ENTRIES.
   */
  set<T>(key: string, data: T, ttlMs = this.defaultTtlMs): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= MAX_CACHE_ENTRIES && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttlMs,
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a specific cache entry
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Global cache instance for scan session
let globalCache: AzureScannerCache | null = null;

export function getGlobalCache(): AzureScannerCache {
  if (!globalCache) {
    globalCache = new AzureScannerCache();
  }
  return globalCache;
}

export function resetGlobalCache(): void {
  if (globalCache) {
    const stats = globalCache.getStats();
    logger.info('Resetting Azure scanner cache', { cachedItems: stats.size });
    globalCache.clear();
  }
  globalCache = null;
}

/**
 * Cache key generators for common resource types
 */
export const CacheKeys = {
  // Compute
  vms: (subscriptionId: string) => `vms:${subscriptionId}`,
  vmExtensions: (vmId: string) => `vm-extensions:${vmId}`,
  aksCluster: (subscriptionId: string) => `aks:${subscriptionId}`,
  appServices: (subscriptionId: string) => `appservices:${subscriptionId}`,
  functions: (subscriptionId: string) => `functions:${subscriptionId}`,
  
  // Storage & Data
  storageAccounts: (subscriptionId: string) => `storage:${subscriptionId}`,
  keyVaults: (subscriptionId: string) => `keyvaults:${subscriptionId}`,
  sqlServers: (subscriptionId: string) => `sql:${subscriptionId}`,
  cosmosDb: (subscriptionId: string) => `cosmosdb:${subscriptionId}`,
  redis: (subscriptionId: string) => `redis:${subscriptionId}`,
  
  // Network
  nsgs: (subscriptionId: string) => `nsgs:${subscriptionId}`,
  vnets: (subscriptionId: string) => `vnets:${subscriptionId}`,
  networkInterfaces: (subscriptionId: string) => `nics:${subscriptionId}`,
  networkInterface: (nicId: string) => `nic:${nicId}`,
  publicIps: (subscriptionId: string) => `publicips:${subscriptionId}`,
  publicIp: (publicIpId: string) => `publicip:${publicIpId}`,
  firewalls: (subscriptionId: string) => `firewalls:${subscriptionId}`,
  networkWatchers: (subscriptionId: string) => `watchers:${subscriptionId}`,
  flowLogs: (subscriptionId: string) => `flowlogs:${subscriptionId}`,
  
  // Security & Defender
  defenderSettings: (subscriptionId: string) => `defender:${subscriptionId}`,
  defenderSecureScores: (subscriptionId: string) => `defender-scores:${subscriptionId}`,
  defenderAssessments: (subscriptionId: string) => `defender-assessments:${subscriptionId}`,
  defenderAlerts: (subscriptionId: string) => `defender-alerts:${subscriptionId}`,
  defenderPricing: (subscriptionId: string) => `defender-pricing:${subscriptionId}`,
  
  // Identity
  entraIdUsers: (tenantId: string) => `entra-users:${tenantId}`,
  entraIdGroups: (tenantId: string) => `entra-groups:${tenantId}`,
  entraIdApps: (tenantId: string) => `entra-apps:${tenantId}`,
} as const;
