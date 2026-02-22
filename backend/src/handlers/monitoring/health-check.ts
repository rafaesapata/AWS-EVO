import { getHttpMethod } from '../../lib/middleware.js';
/**
 * Platform Health Check - Military-Grade
 * 
 * Verifica saúde completa da plataforma:
 * - Database (PostgreSQL via Prisma) com latência
 * - Cache (Redis/MemoryDB) com latência
 * - Memory usage com thresholds
 * - Event loop lag
 * - Cold start detection
 * - Uptime tracking
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { checkRedisHealth } from '../../lib/redis-cache.js';

// Cold start detection
let isFirstInvocation = true;
const startupTime = Date.now();

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency_ms?: number;
  error?: string;
  details?: Record<string, any>;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }

  const handlerStart = Date.now();
  const isColdStart = isFirstInvocation;
  isFirstInvocation = false;

  try {
    const checks: Record<string, HealthCheck> = {};

    // 1. Lambda runtime check
    checks.lambda = {
      status: 'healthy',
      details: {
        timestamp: new Date().toISOString(),
        coldStart: isColdStart,
        uptimeMs: Date.now() - startupTime,
        functionName: context.functionName,
        functionVersion: context.functionVersion,
        remainingTimeMs: context.getRemainingTimeInMillis(),
      },
    };

    // 2. Database check with latency measurement
    const dbStart = Date.now();
    try {
      const prisma = getPrismaClient();
      const result = await prisma.$queryRaw<[{ now: Date }]>`SELECT NOW() as now`;
      const dbLatency = Date.now() - dbStart;
      checks.database = {
        status: dbLatency > 2000 ? 'degraded' : 'healthy',
        latency_ms: dbLatency,
        details: {
          serverTime: result[0]?.now,
          connectionPool: 'active',
        },
      };
    } catch (dbError) {
      checks.database = {
        status: 'unhealthy',
        latency_ms: Date.now() - dbStart,
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
      };
    }

    // 3. Redis/MemoryDB check with latency
    const cacheStart = Date.now();
    try {
      const redisHealth = await checkRedisHealth();
      const cacheLatency = Date.now() - cacheStart;
      checks.cache = {
        status: cacheLatency > 1000 ? 'degraded' : (redisHealth.status === 'healthy' ? 'healthy' : 'degraded'),
        latency_ms: cacheLatency,
        details: redisHealth,
      };
    } catch (cacheError) {
      checks.cache = {
        status: 'unhealthy',
        latency_ms: Date.now() - cacheStart,
        error: cacheError instanceof Error ? cacheError.message : 'Unknown error',
      };
    }

    // 4. Memory analysis with thresholds
    const mem = process.memoryUsage();
    const memoryLimitMB = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '512');
    const heapUsedMB = mem.heapUsed / 1024 / 1024;
    const heapTotalMB = mem.heapTotal / 1024 / 1024;
    const rssMB = mem.rss / 1024 / 1024;
    const memoryUtilization = (rssMB / memoryLimitMB) * 100;

    checks.memory = {
      status: memoryUtilization > 90 ? 'unhealthy' : memoryUtilization > 75 ? 'degraded' : 'healthy',
      details: {
        heapUsedMB: Math.round(heapUsedMB * 100) / 100,
        heapTotalMB: Math.round(heapTotalMB * 100) / 100,
        rssMB: Math.round(rssMB * 100) / 100,
        externalMB: Math.round(mem.external / 1024 / 1024 * 100) / 100,
        limitMB: memoryLimitMB,
        utilizationPercent: Math.round(memoryUtilization * 100) / 100,
      },
    };

    // 5. Event loop lag measurement
    const eventLoopStart = Date.now();
    await new Promise(resolve => setImmediate(resolve));
    const eventLoopLag = Date.now() - eventLoopStart;

    checks.eventLoop = {
      status: eventLoopLag > 100 ? 'degraded' : 'healthy',
      latency_ms: eventLoopLag,
      details: {
        lagMs: eventLoopLag,
        threshold: 100,
      },
    };

    // Determine overall status
    const statuses = Object.values(checks).map(c => c.status);
    const overallStatus = statuses.includes('unhealthy')
      ? 'unhealthy'
      : statuses.includes('degraded')
        ? 'degraded'
        : 'healthy';

    const totalLatency = Date.now() - handlerStart;

    return success({
      status: overallStatus,
      checks,
      meta: {
        version: process.env.APP_VERSION || '1.0.0',
        environment: process.env.ENVIRONMENT || process.env.NODE_ENV || 'production',
        region: process.env.AWS_REGION || 'us-east-1',
        totalCheckDuration: totalLatency,
        coldStart: isColdStart,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (err) {
    logger.error('Health check critical failure', err as Error);
    return error('Service temporarily unavailable', 503);
  }
}
