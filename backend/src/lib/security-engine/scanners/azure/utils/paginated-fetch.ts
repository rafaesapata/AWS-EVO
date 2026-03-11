/**
 * Shared paginated fetch for Azure ARM API.
 *
 * Eliminates copy-pasted pagination loops across 9+ scanners.
 * Handles nextLink traversal, safety page limits, and error strategies.
 */

import { rateLimitedFetch } from './rate-limiter.js';
import { getGlobalCache } from './cache.js';
import { logger } from '../../../../logging.js';
import type { AzureScanContext } from '../types.js';

/** Standard Azure ARM list response shape */
interface AzureListResponse<T> {
  value?: T[];
  nextLink?: string;
}

interface PaginatedFetchOptions {
  /** Cache key for this request. Results are cached via AzureScannerCache. */
  cacheKey: string;
  /** Label used in logs and rate-limiter metrics */
  operationName: string;
  /** Maximum pages to fetch before stopping (default: 20) */
  maxPages?: number;
  /** If true, throws on non-OK responses. If false, breaks the loop and returns partial results. */
  throwOnError?: boolean;
}

const DEFAULT_MAX_PAGES = 20;

/**
 * Fetches a paginated Azure ARM resource list with caching, rate limiting,
 * and a safety page limit.
 *
 * @example
 * ```ts
 * const vms = await fetchAzurePagedList<VM>(
 *   context,
 *   `https://management.azure.com/subscriptions/${ctx.subscriptionId}/providers/Microsoft.Compute/virtualMachines?api-version=2023-09-01`,
 *   { cacheKey: CacheKeys.vms(ctx.subscriptionId), operationName: 'fetchVMs' }
 * );
 * ```
 */
export async function fetchAzurePagedList<T>(
  context: AzureScanContext,
  initialUrl: string,
  options: PaginatedFetchOptions
): Promise<T[]> {
  const { cacheKey, operationName, maxPages = DEFAULT_MAX_PAGES, throwOnError = true } = options;
  const cache = getGlobalCache();

  return cache.getOrFetch(cacheKey, async () => {
    const items: T[] = [];
    let url: string | null = initialUrl;
    let pageCount = 0;

    try {
      while (url && pageCount < maxPages) {
        pageCount++;
        const response = await rateLimitedFetch(url, {
          headers: {
            'Authorization': `Bearer ${context.accessToken}`,
            'Content-Type': 'application/json',
          },
        }, operationName);

        if (!response.ok) {
          if (throwOnError) {
            throw new Error(`Failed to fetch ${operationName}: ${response.status} ${response.statusText}`);
          }
          logger.warn(`${operationName}: non-OK response, returning partial results`, { status: response.status, itemsCollected: items.length });
          break;
        }

        const data = await response.json() as AzureListResponse<T>;
        items.push(...(data.value || []));
        url = data.nextLink || null;
      }

      if (pageCount >= maxPages && url) {
        logger.warn(`${operationName}: hit max page limit with more pages available`, { maxPages, pageCount, itemsCollected: items.length });
      }

      logger.debug(`${operationName}: fetched ${items.length} items in ${pageCount} page(s)`);
      return items;
    } catch (err) {
      if (throwOnError) throw err;
      logger.warn(`${operationName}: error during pagination, returning partial results`, {
        error: (err as Error).message,
        itemsCollected: items.length,
      });
      return items;
    }
  });
}
