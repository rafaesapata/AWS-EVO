/**
 * Lambda to check Prisma migration status
 * Runs inside VPC with RDS access - internal use only
 */

import type { APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

interface MigrationRecord {
  migration_name: string;
  finished_at: Date | null;
  applied_steps_count: number;
}

const MAX_MIGRATIONS = 30;

export async function handler(): Promise<APIGatewayProxyResultV2> {
  try {
    logger.info('Checking migration status');
    
    const prisma = getPrismaClient();
    
    const migrations = await prisma.$queryRaw<MigrationRecord[]>`
      SELECT migration_name, finished_at, applied_steps_count 
      FROM _prisma_migrations 
      ORDER BY finished_at DESC 
      LIMIT ${MAX_MIGRATIONS}
    `;
    
    logger.info('Migrations retrieved', { count: migrations.length });
    
    return success({
      migrations: migrations.map(m => ({
        name: m.migration_name,
        finishedAt: m.finished_at,
        stepsApplied: m.applied_steps_count,
      })),
      count: migrations.length,
    });
  } catch (err) {
    logger.error('Check migrations failed', err as Error);
    return error('Failed to check migrations');
  }
}
