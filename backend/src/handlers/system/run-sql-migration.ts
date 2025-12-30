/**
 * Lambda handler for running SQL migrations
 * SECURITY: Requires super_admin authentication
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { getUserFromEvent, isSuperAdmin } from '../../lib/auth.js';

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
    
    // Add SSL columns to monitored_endpoints
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
