/**
 * Lambda handler for running SQL migrations
 * MILITARY GRADE: Requires super_admin authentication with strict validation
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions, badRequest } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { getUserFromEvent, isSuperAdmin } from '../../lib/auth.js';

// MILITARY GRADE: Only allow specific DDL operations
const ALLOWED_DDL_PATTERNS = [
  /^ALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN/i,
  /^ALTER\s+TABLE\s+\w+\s+DROP\s+COLUMN/i,
  /^ALTER\s+TABLE\s+\w+\s+ALTER\s+COLUMN/i,
  /^CREATE\s+INDEX/i,
  /^CREATE\s+UNIQUE\s+INDEX/i,
  /^DROP\s+INDEX/i,
  /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i,
];

// MILITARY GRADE: Dangerous patterns to block
const DANGEROUS_PATTERNS = [
  /DROP\s+TABLE(?!\s+IF\s+EXISTS)/i,  // Allow DROP TABLE IF EXISTS only
  /TRUNCATE/i,
  /DELETE\s+FROM/i,
  /UPDATE\s+\w+\s+SET/i,
  /INSERT\s+INTO/i,
  /GRANT/i,
  /REVOKE/i,
  /CREATE\s+USER/i,
  /DROP\s+USER/i,
  /ALTER\s+USER/i,
  /CREATE\s+ROLE/i,
  /DROP\s+ROLE/i,
  /xp_cmdshell/i,
  /EXEC\s*\(/i,
];

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 SQL Migration handler started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  // SECURITY: Require authentication
  let user;
  try {
    user = getUserFromEvent(event);
  } catch {
    logger.security('UNAUTHORIZED_MIGRATION_ATTEMPT', {
      ip: event.requestContext?.identity?.sourceIp
    });
    return error('Unauthorized', 401);
  }
  
  // SECURITY: Require super_admin role
  if (!isSuperAdmin(user)) {
    logger.security('FORBIDDEN_MIGRATION_ATTEMPT', {
      userId: user.sub,
      ip: event.requestContext?.identity?.sourceIp
    });
    return error('Forbidden - Super admin required', 403);
  }
  
  try {
    const prisma = getPrismaClient();
    
    // Parse body for custom SQL
    let body: { rawSql?: string } = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch {
        // ignore parse errors
      }
    }
    
    // If rawSql is provided, validate and execute it
    if (body.rawSql) {
      const sql = body.rawSql.trim();
      
      // MILITARY GRADE: Limit SQL length
      if (sql.length > 10000) {
        return badRequest('SQL too long (max 10000 characters)');
      }

      // MILITARY GRADE: Check for dangerous patterns
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(sql)) {
          logger.security('DANGEROUS_SQL_BLOCKED', {
            userId: user.sub,
            pattern: pattern.toString(),
            sql: sql.substring(0, 100)
          });
          return badRequest('SQL contains forbidden patterns');
        }
      }

      // MILITARY GRADE: Verify SQL matches allowed patterns
      const isAllowed = ALLOWED_DDL_PATTERNS.some(pattern => pattern.test(sql));
      if (!isAllowed) {
        logger.security('UNALLOWED_SQL_BLOCKED', {
          userId: user.sub,
          sql: sql.substring(0, 100)
        });
        return badRequest('Only DDL operations (ALTER TABLE, CREATE INDEX) are allowed');
      }

      logger.info('Executing validated SQL migration', { 
        userId: user.sub, 
        sqlLength: sql.length,
        sql: sql.substring(0, 200)
      });
      
      await prisma.$executeRawUnsafe(sql);
      
      logger.info('✅ Custom SQL executed successfully', { userId: user.sub });
      
      return success({
        success: true,
        message: 'Custom SQL executed successfully'
      });
    }
    
    // Default migration: Add SSL columns to monitored_endpoints
    await prisma.$executeRawUnsafe(`
      ALTER TABLE monitored_endpoints 
      ADD COLUMN IF NOT EXISTS monitor_ssl BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS ssl_alert_days INTEGER DEFAULT 30,
      ADD COLUMN IF NOT EXISTS ssl_expiry_date TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ssl_issuer VARCHAR(255),
      ADD COLUMN IF NOT EXISTS ssl_valid BOOLEAN
    `);
    
    logger.info('✅ SSL columns added to monitored_endpoints', { userId: user.sub });
    
    return success({
      success: true,
      message: 'Migration completed successfully',
      migrations: ['add_ssl_columns_to_monitored_endpoints']
    });
    
  } catch (err) {
    logger.error('❌ SQL Migration error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
