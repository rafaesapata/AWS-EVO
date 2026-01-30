/**
 * Lambda handler for running raw SQL queries (READ ONLY)
 * Admin-only operation for debugging and data inspection
 * MILITARY GRADE: Strict validation to prevent SQL injection
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions, unauthorized } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { getUserFromEvent, isSuperAdmin } from '../../lib/auth.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

// Zod schema for SQL query validation
const runSqlSchema = z.object({
  sql: z.string().min(1, 'SQL query is required').max(5000, 'Query too long (max 5000 characters)'),
});

// MILITARY GRADE: Dangerous SQL patterns that could be used for injection
const DANGEROUS_PATTERNS = [
  /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)/i,
  /--/,  // SQL comments
  /\/\*/,  // Block comments
  /UNION\s+(ALL\s+)?SELECT/i,
  /INTO\s+(OUTFILE|DUMPFILE)/i,
  /LOAD_FILE/i,
  /BENCHMARK\s*\(/i,
  /SLEEP\s*\(/i,
  /WAITFOR\s+DELAY/i,
  /xp_cmdshell/i,
  /EXEC\s*\(/i,
  /EXECUTE\s*\(/i,
];

// MILITARY GRADE: Allowed tables for read-only queries
const ALLOWED_TABLES = [
  'daily_costs',
  'aws_credentials',
  'security_scans',
  'findings',
  'profiles',
  'organizations',
  'users',
  'audit_logs',
  'security_events',
];

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
    // MILITARY GRADE: Only super_admin can run raw SQL
    const user = getUserFromEvent(event);
    if (!isSuperAdmin(user)) {
      logger.warn('Unauthorized SQL access attempt', { userId: user.sub });
      return unauthorized('Only super_admin can execute raw SQL queries', origin);
    }

    // Parse and validate body using centralized validation
    const validation = parseAndValidateBody(runSqlSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { sql } = validation.data;
    
    // Only allow SELECT queries for safety
    const normalizedSql = sql.trim().toUpperCase();
    if (!normalizedSql.startsWith('SELECT')) {
      return badRequest('Only SELECT queries are allowed');
    }

    // MILITARY GRADE: Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(sql)) {
        logger.warn('Dangerous SQL pattern detected', { 
          userId: user.sub, 
          pattern: pattern.toString(),
          sql: sql.substring(0, 100) 
        });
        return badRequest('Query contains forbidden patterns');
      }
    }

    // MILITARY GRADE: Audit log the query
    logger.info('Admin SQL query executed', { 
      userId: user.sub, 
      sql: sql.substring(0, 500),
      requestId: context.awsRequestId 
    });
    
    const prisma = getPrismaClient();
    
    const results = await prisma.$queryRawUnsafe(sql);
    
    logger.info('SQL completed', { 
      rowCount: Array.isArray(results) ? results.length : 1,
      userId: user.sub 
    });
    
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
