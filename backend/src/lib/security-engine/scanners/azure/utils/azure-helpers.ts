/**
 * Shared Azure scanner helpers.
 *
 * Eliminates copy-pasted utility functions across 10+ scanners:
 * - extractResourceGroup: parses resource group from ARM resource IDs
 * - fetchAzureSubResource: cached, rate-limited fetch for single sub-resources (non-paginated)
 * - fetchAzureSubResourceList: cached, rate-limited fetch for sub-resource lists (value[] responses)
 */

import { getGlobalCache } from './cache.js';
import { rateLimitedFetch } from './rate-limiter.js';
import type { AzureScanContext } from '../types.js';

/**
 * Extracts the resource group name from an Azure ARM resource ID.
 * Case-insensitive match — Azure ARM IDs may vary casing on the segment.
 *
 * @example
 * extractResourceGroup('/subscriptions/.../resourceGroups/my-rg/providers/...')
 * // => 'my-rg'
 */
export function extractResourceGroup(resourceId: string): string {
  const match = resourceId?.match(/\/resourceGroups\/([^/]+)/i);
  return match?.[1] || 'unknown';
}

/** Standard authorization headers for Azure ARM / data-plane calls */
function buildAuthHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Internal: shared fetch-with-cache logic for both single and list variants.
 * Keeps the two public functions DRY while preserving their distinct signatures.
 */
async function cachedFetch<T>(
  context: AzureScanContext,
  url: string,
  cacheKey: string,
  operationName: string,
  fallback: T,
  extractBody: (response: Response) => Promise<T>
): Promise<T> {
  const cache = getGlobalCache();

  return cache.getOrFetch(cacheKey, async () => {
    try {
      const response = await rateLimitedFetch(
        url,
        { headers: buildAuthHeaders(context.accessToken) },
        operationName
      );
      if (!response.ok) return fallback;
      return await extractBody(response);
    } catch {
      return fallback;
    }
  });
}

/**
 * Fetches a single Azure sub-resource with caching and rate limiting.
 * Use for endpoints that return a single object (not a list).
 *
 * Returns `null` on non-OK responses or network errors (non-throwing).
 *
 * @example
 * const auditing = await fetchAzureSubResource<AuditingSettings>(
 *   context, url, 'sql-auditing:serverId', 'fetchAuditingSettings'
 * );
 */
export async function fetchAzureSubResource<T>(
  context: AzureScanContext,
  url: string,
  cacheKey: string,
  operationName: string
): Promise<T | null> {
  return cachedFetch<T | null>(
    context, url, cacheKey, operationName, null,
    async (response) => await response.json() as T
  );
}

/**
 * Fetches a list of Azure sub-resources with caching and rate limiting.
 * Use for endpoints that return `{ value: T[] }` but do NOT need pagination.
 *
 * Returns `[]` on non-OK responses or network errors (non-throwing).
 *
 * @example
 * const rules = await fetchAzureSubResourceList<FirewallRule>(
 *   context, url, 'sql-firewall:serverId', 'fetchFirewallRules'
 * );
 */
export async function fetchAzureSubResourceList<T>(
  context: AzureScanContext,
  url: string,
  cacheKey: string,
  operationName: string
): Promise<T[]> {
  return cachedFetch<T[]>(
    context, url, cacheKey, operationName, [],
    async (response) => {
      const data = await response.json() as { value?: T[] };
      return data.value || [];
    }
  );
}
