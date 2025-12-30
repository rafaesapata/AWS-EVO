/**
 * Lambda handler for running raw SQL queries (READ ONLY)
 * Admin-only operation for debugging and data inspection
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event) || '*';
  logger.info('Run SQL started', { requestId: context.awsRequestId });
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    // Parse body
    let body: { sql?: string } = {};
    if (event.body) {
      try {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      } catch {
        return badRequest('Invalid JSON body');
      }
    }
    
    const { sql } = body;
    
    if (!sql) {
      return badRequest('Missing required field: sql');
    }
    
    // Only allow SELECT queries for safety
    const normalizedSql = sql.trim().toUpperCase();
    if (!normalizedSql.startsWith('SELECT')) {
      return badRequest('Only SELECT queries are allowed');
    }
    
    const prisma = getPrismaClient();
    
    logger.info('Executing SQL', { sql: sql.substring(0, 200) });
    
    const results = await prisma.$queryRawUnsafe(sql);
    
    logger.info('SQL completed', { rowCount: Array.isArray(results) ? results.length : 1 });
    
    return success({
      success: true,
      data: results,
      rowCount: Array.isArray(results) ? results.length : 1,
    });
    
  } catch (err) {
    logger.error('SQL error', err as Error, { requestId: context.awsRequestId });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
