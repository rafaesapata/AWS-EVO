/**
 * Lambda handler for running database migrations
 * Recreates daily_costs table with proper structure for multi-tenant isolation
 * NOTE: This is an admin-only operation, invoked directly (not via API Gateway)
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, unauthorized } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { getUserFromEvent, isSuperAdmin } from '../../lib/auth.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event) || '*';
  logger.info('Run Migration started', { requestId: context.awsRequestId });
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    // CRITICAL: Only super_admin can run migrations
    const user = getUserFromEvent(event);
    if (!isSuperAdmin(user)) {
      logger.warn('Unauthorized migration attempt', { userId: user.sub, email: user.email });
      return unauthorized('Only super_admin can run database migrations', origin);
    }
    
    logger.info('Migration authorized', { userId: user.sub });
    const prisma = getPrismaClient();
    const results: string[] = [];
    
    // Step 1: Drop the old table
    try {
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS daily_costs CASCADE`);
      results.push('Dropped old daily_costs table');
    } catch (e: any) {
      results.push(`Drop table error: ${e.message}`);
    }
    
    // Step 2: Create new table with correct structure
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE daily_costs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id UUID NOT NULL,
          aws_account_id UUID NOT NULL,
          date DATE NOT NULL,
          service VARCHAR(255),
          cost DOUBLE PRECISION NOT NULL DEFAULT 0,
          usage DOUBLE PRECISION DEFAULT 0,
          currency VARCHAR(10) DEFAULT 'USD',
          created_at TIMESTAMPTZ(6) DEFAULT NOW()
        )
      `);
      results.push('Created new daily_costs table with proper structure');
    } catch (e: any) {
      results.push(`Create table error: ${e.message}`);
    }
    
    // Step 3: Create indexes for performance and isolation
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX daily_costs_organization_id_idx ON daily_costs(organization_id)
      `);
      results.push('Created index on organization_id');
    } catch (e: any) {
      results.push(`Index org error: ${e.message}`);
    }
    
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX daily_costs_aws_account_id_idx ON daily_costs(aws_account_id)
      `);
      results.push('Created index on aws_account_id');
    } catch (e: any) {
      results.push(`Index aws error: ${e.message}`);
    }
    
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX daily_costs_date_idx ON daily_costs(date)
      `);
      results.push('Created index on date');
    } catch (e: any) {
      results.push(`Index date error: ${e.message}`);
    }
    
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX daily_costs_org_date_idx ON daily_costs(organization_id, date)
      `);
      results.push('Created composite index on organization_id, date');
    } catch (e: any) {
      results.push(`Index composite error: ${e.message}`);
    }
    
    // Step 4: Create unique constraint to prevent duplicates
    try {
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX daily_costs_unique_idx 
        ON daily_costs(organization_id, aws_account_id, date, service)
      `);
      results.push('Created unique constraint on org+account+date+service');
    } catch (e: any) {
      results.push(`Unique constraint error: ${e.message}`);
    }
    
    logger.info('Migration completed', { results });
    
    return success({
      success: true,
      message: 'daily_costs table recreated with proper multi-tenant isolation',
      results,
    });
    
  } catch (err) {
    logger.error('Migration error', err as Error, { requestId: context.awsRequestId });
    return error('Migration failed. Check logs for details.', 500);
  }
}
