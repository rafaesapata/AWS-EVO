/**
 * Lambda handler para health check
 * AWS Lambda Handler for health-check
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const checks: Record<string, any> = {
      lambda: { status: 'healthy', timestamp: new Date().toISOString() },
      database: { status: 'unknown' },
      memory: {
        used: process.memoryUsage().heapUsed / 1024 / 1024,
        total: process.memoryUsage().heapTotal / 1024 / 1024,
        limit: parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '512'),
      },
    };
    
    // Check database
    try {
      const prisma = getPrismaClient();
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'healthy', latency_ms: 0 };
    } catch (dbError) {
      checks.database = { 
        status: 'unhealthy', 
        error: dbError instanceof Error ? dbError.message : 'Unknown error' 
      };
    }
    
    const allHealthy = Object.values(checks).every(
      check => !check.status || check.status === 'healthy'
    );
    
    return success({
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    });
    
  } catch (err) {
    logger.error('❌ Health check error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error', 503);
  }
}
