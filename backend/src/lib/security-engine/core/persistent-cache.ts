/**
 * Security Engine V3 - Persistent Cache
 * Uses DynamoDB for cache persistence across Lambda cold starts
 * Falls back to in-memory cache if DynamoDB is unavailable
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand, AttributeValue } from '@aws-sdk/client-dynamodb';
import { logger } from '../../logging.js';
import { CACHE_TTL } from '../config.js';

// Simple marshall/unmarshall functions to avoid @aws-sdk/util-dynamodb dependency
function marshall(obj: Record<string, any>, options?: { removeUndefinedValues?: boolean }): Record<string, AttributeValue> {
  const result: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (options?.removeUndefinedValues && value === undefined) continue;
    result[key] = toAttributeValue(value);
  }
  return result;
}

function toAttributeValue(value: any): AttributeValue {
  if (value === null) return { NULL: true };
  if (typeof value === 'string') return { S: value };
  if (typeof value === 'number') return { N: String(value) };
  if (typeof value === 'boolean') return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(toAttributeValue) };
  if (typeof value === 'object') {
    const m: Record<string, AttributeValue> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) m[k] = toAttributeValue(v);
    }
    return { M: m };
  }
  return { S: String(value) };
}

function unmarshall(item: Record<string, AttributeValue>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(item)) {
    result[key] = fromAttributeValue(value);
  }
  return result;
}

function fromAttributeValue(attr: AttributeValue): any {
  if (attr.S !== undefined) return attr.S;
  if (attr.N !== undefined) return Number(attr.N);
  if (attr.BOOL !== undefined) return attr.BOOL;
  if (attr.NULL) return null;
  if (attr.L) return attr.L.map(fromAttributeValue);
  if (attr.M) return unmarshall(attr.M);
  return null;
}

const CACHE_TABLE_NAME = process.env.SECURITY_CACHE_TABLE || 'evo-security-scan-cache';
const CACHE_ENABLED = process.env.SECURITY_CACHE_ENABLED !== 'false';

interface CacheEntry<T> {
  pk: string;           // Partition key: accountId
  sk: string;           // Sort key: cacheKey
  data: T;
  expires: number;      // TTL timestamp
  hits: number;
  createdAt: number;
  updatedAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  dynamoHits: number;
  dynamoMisses: number;
  errors: number;
}

/**
 * Persistent cache with DynamoDB backend and in-memory fallback
 */
export class PersistentCache {
  private memoryCache: Map<string, { data: any; expires: number; hits: number }> = new Map();
  private dynamoClient: DynamoDBClient | null = null;
  private accountId: string;
  private ttl: number;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    dynamoHits: 0,
    dynamoMisses: 0,
    errors: 0,
  };
  private dynamoAvailable: boolean = true;

  constructor(accountId: string, ttl: number = CACHE_TTL) {
    this.accountId = accountId;
    this.ttl = ttl;
    
    if (CACHE_ENABLED) {
      try {
        this.dynamoClient = new DynamoDBClient({
          region: process.env.AWS_REGION || 'us-east-1',
        });
      } catch (error) {
        logger.warn('[PersistentCache] Failed to initialize DynamoDB client, using memory-only cache', {
          error: (error as Error).message,
        });
        this.dynamoAvailable = false;
      }
    }
  }

  /**
   * Get value from cache (checks memory first, then DynamoDB)
   */
  async get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const fullKey = this.buildKey(key);
    
    // Check memory cache first
    const memCached = this.memoryCache.get(fullKey);
    if (memCached && memCached.expires > Date.now()) {
      memCached.hits++;
      this.stats.hits++;
      return memCached.data as T;
    }
    
    // Check DynamoDB cache
    if (this.dynamoAvailable && this.dynamoClient) {
      try {
        const dynamoData = await this.getFromDynamo<T>(fullKey);
        if (dynamoData !== null) {
          // Store in memory cache for faster subsequent access
          this.memoryCache.set(fullKey, {
            data: dynamoData,
            expires: Date.now() + this.ttl,
            hits: 1,
          });
          this.stats.dynamoHits++;
          this.stats.hits++;
          return dynamoData;
        }
        this.stats.dynamoMisses++;
      } catch (error) {
        this.stats.errors++;
        logger.warn('[PersistentCache] DynamoDB get failed, falling back to fetcher', {
          key: fullKey,
          error: (error as Error).message,
        });
      }
    }
    
    // Cache miss - fetch data
    this.stats.misses++;
    const data = await fetcher();
    
    // Store in both caches
    await this.set(key, data);
    
    return data;
  }

  /**
   * Set value in cache (both memory and DynamoDB)
   */
  async set<T>(key: string, data: T, customTtl?: number): Promise<void> {
    const fullKey = this.buildKey(key);
    const expires = Date.now() + (customTtl || this.ttl);
    
    // Store in memory cache
    this.memoryCache.set(fullKey, {
      data,
      expires,
      hits: 0,
    });
    
    // Store in DynamoDB (async, don't wait)
    if (this.dynamoAvailable && this.dynamoClient) {
      this.setInDynamo(fullKey, data, expires).catch((error) => {
        this.stats.errors++;
        logger.warn('[PersistentCache] DynamoDB set failed', {
          key: fullKey,
          error: (error as Error).message,
        });
      });
    }
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    const fullKey = this.buildKey(key);
    
    // Check memory first
    const memCached = this.memoryCache.get(fullKey);
    if (memCached && memCached.expires > Date.now()) {
      return true;
    }
    
    // Check DynamoDB
    if (this.dynamoAvailable && this.dynamoClient) {
      try {
        const data = await this.getFromDynamo(fullKey);
        return data !== null;
      } catch {
        return false;
      }
    }
    
    return false;
  }

  /**
   * Invalidate a specific key
   */
  async invalidate(key: string): Promise<boolean> {
    const fullKey = this.buildKey(key);
    const existed = this.memoryCache.has(fullKey);
    
    this.memoryCache.delete(fullKey);
    
    if (this.dynamoAvailable && this.dynamoClient) {
      try {
        await this.deleteFromDynamo(fullKey);
      } catch (error) {
        logger.warn('[PersistentCache] DynamoDB delete failed', {
          key: fullKey,
          error: (error as Error).message,
        });
      }
    }
    
    return existed;
  }

  /**
   * Invalidate keys matching a pattern
   */
  async invalidatePattern(pattern: RegExp): Promise<number> {
    let count = 0;
    
    // Invalidate from memory
    for (const key of this.memoryCache.keys()) {
      if (pattern.test(key)) {
        this.memoryCache.delete(key);
        count++;
      }
    }
    
    // Note: DynamoDB pattern invalidation would require a scan
    // For now, we rely on TTL for DynamoDB cleanup
    
    return count;
  }

  /**
   * Clear all cache entries for this account
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    
    // Note: DynamoDB entries will expire via TTL
    // Full clear would require a scan + batch delete
  }

  /**
   * Cleanup expired entries from memory cache
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expires <= now) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { memorySize: number; hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      memorySize: this.memoryCache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      dynamoHits: 0,
      dynamoMisses: 0,
      errors: 0,
    };
  }

  /**
   * Build full cache key
   */
  private buildKey(key: string): string {
    return `${this.accountId}:${key}`;
  }

  /**
   * Get from DynamoDB
   */
  private async getFromDynamo<T>(fullKey: string): Promise<T | null> {
    if (!this.dynamoClient) return null;
    
    const [pk, ...skParts] = fullKey.split(':');
    const sk = skParts.join(':');
    
    const response = await this.dynamoClient.send(new GetItemCommand({
      TableName: CACHE_TABLE_NAME,
      Key: marshall({ pk, sk }),
    }));
    
    if (!response.Item) return null;
    
    const item = unmarshall(response.Item) as CacheEntry<T>;
    
    // Check if expired
    if (item.expires <= Date.now()) {
      return null;
    }
    
    return item.data;
  }

  /**
   * Set in DynamoDB
   */
  private async setInDynamo<T>(fullKey: string, data: T, expires: number): Promise<void> {
    if (!this.dynamoClient) return;
    
    const [pk, ...skParts] = fullKey.split(':');
    const sk = skParts.join(':');
    const now = Date.now();
    
    const item: CacheEntry<T> = {
      pk,
      sk,
      data,
      expires,
      hits: 0,
      createdAt: now,
      updatedAt: now,
    };
    
    await this.dynamoClient.send(new PutItemCommand({
      TableName: CACHE_TABLE_NAME,
      Item: marshall(item, { removeUndefinedValues: true }),
    }));
  }

  /**
   * Delete from DynamoDB
   */
  private async deleteFromDynamo(fullKey: string): Promise<void> {
    if (!this.dynamoClient) return;
    
    const [pk, ...skParts] = fullKey.split(':');
    const sk = skParts.join(':');
    
    await this.dynamoClient.send(new DeleteItemCommand({
      TableName: CACHE_TABLE_NAME,
      Key: marshall({ pk, sk }),
    }));
  }

  /**
   * Generate cache key for AWS resources
   */
  static key(service: string, region: string, resource: string, ...args: string[]): string {
    const parts = [service, region, resource, ...args].filter(Boolean);
    return parts.join(':');
  }
}

// Factory function to create cache for a specific account
let cacheInstances: Map<string, PersistentCache> = new Map();

export function getPersistentCache(accountId: string): PersistentCache {
  if (!cacheInstances.has(accountId)) {
    cacheInstances.set(accountId, new PersistentCache(accountId));
  }
  return cacheInstances.get(accountId)!;
}

export function resetPersistentCache(accountId?: string): void {
  if (accountId) {
    cacheInstances.delete(accountId);
  } else {
    cacheInstances.clear();
  }
}
