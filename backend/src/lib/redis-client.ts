/**
 * Centralized Redis/MemoryDB Client
 * 
 * Singleton connection to Amazon MemoryDB (Redis 7.x compatible).
 * TLS enabled by default (MemoryDB requires it).
 * Graceful fallback to null when REDIS_URL is not configured.
 * 
 * Usage:
 *   import { getRedisClient, isRedisConnected } from './redis-client.js';
 *   const redis = getRedisClient();
 *   if (redis) { await redis.get('key'); }
 */

import Redis from 'ioredis';
import { logger } from './logger.js';

// ============================================================================
// SINGLETON
// ============================================================================

let client: Redis | null = null;
let connected = false;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30_000; // 30s

/**
 * Get or create the Redis client singleton.
 * Returns null if REDIS_URL is not set (graceful degradation).
 */
export function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL || process.env.MEMORYDB_ENDPOINT;

  if (!url) {
    return null;
  }

  if (client) {
    return client;
  }

  try {
    // MemoryDB uses rediss:// (TLS). ioredis detects from scheme.
    client = new Redis(url, {
      tls: url.startsWith('rediss://') ? {} : undefined,
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
      commandTimeout: 2000,
      retryStrategy: (times) => {
        if (times > 3) return null; // stop retrying
        return Math.min(times * 200, 1000);
      },
      lazyConnect: true,
      enableReadyCheck: true,
      // MemoryDB single-node doesn't need cluster mode
    });

    client.on('connect', () => {
      connected = true;
      logger.info('[Redis] Connected to MemoryDB');
    });

    client.on('error', (err) => {
      connected = false;
      logger.warn('[Redis] Connection error', { error: err.message });
    });

    client.on('close', () => {
      connected = false;
    });

    client.on('reconnecting', () => {
      logger.info('[Redis] Reconnecting...');
    });

    // Trigger lazy connect
    client.connect().catch((err) => {
      logger.warn('[Redis] Initial connect failed, will retry', { error: err.message });
      connected = false;
    });
  } catch (err) {
    logger.warn('[Redis] Failed to create client', { error: (err as Error).message });
    client = null;
    return null;
  }

  return client;
}

/**
 * Check if Redis is currently connected and responsive.
 * Caches result for HEALTH_CHECK_INTERVAL to avoid excessive pings.
 */
export async function isRedisConnected(): Promise<boolean> {
  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
    return connected;
  }

  const redis = getRedisClient();
  if (!redis) {
    connected = false;
    lastHealthCheck = now;
    return false;
  }

  try {
    await redis.ping();
    connected = true;
  } catch {
    connected = false;
  }

  lastHealthCheck = now;
  return connected;
}

/**
 * Close the Redis connection (for graceful shutdown).
 */
export async function closeRedisClient(): Promise<void> {
  if (client) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
    client = null;
    connected = false;
  }
}
