/**
 * Lambda handler for running database migrations
 * Adds missing columns to tables
 * NOTE: This is an admin-only operation, invoked directly (not via API Gateway)
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';

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
    const prisma = getPrismaClient();
    const results: string[] = [];
    
    // Migration 1: Add aws_account_id to daily_costs if not exists
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE daily_costs 
        ADD COLUMN IF NOT EXISTS aws_account_id UUID
      `);
      results.push('Added aws_account_id to daily_costs');
    } catch (e: any) {
      if (!e.message?.includes('already exists')) {
        results.push(`daily_costs migration error: ${e.message}`);
      } else {
        results.push('aws_account_id already exists in daily_costs');
      }
    }
    
    // Migration 2: Create index on aws_account_id if not exists
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS daily_costs_aws_account_id_idx 
        ON daily_costs(aws_account_id)
      `);
      results.push('Created index on daily_costs.aws_account_id');
    } catch (e: any) {
      results.push(`Index creation: ${e.message}`);
    }
    
    logger.info('Migration completed', { results });
    
    return success({
      success: true,
      message: 'Migrations executed',
      results,
    });
    
  } catch (err) {
    logger.error('Migration error', err as Error, { requestId: context.awsRequestId });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
