/**
 * Run Migration - Execute SQL migration
 * Temporary handler to run database migrations
 */

import type { APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { getPrismaClient } from '../../lib/database.js';

const MIGRATION_SQL = `
-- Add product_type column to licenses table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'licenses' AND column_name = 'product_type'
  ) THEN
    ALTER TABLE "licenses" ADD COLUMN "product_type" TEXT;
  END IF;
END $$;
`;

export async function handler(): Promise<APIGatewayProxyResultV2> {
  logger.info('🔄 Running license system migration (FK constraint)...');

  try {
    const prisma = getPrismaClient() as any;

    // Split and execute each statement
    const statements = MIGRATION_SQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    const results = [];

    for (const statement of statements) {
      try {
        await prisma.$executeRawUnsafe(statement + ';');
        results.push({ statement: statement.substring(0, 50) + '...', success: true });
      } catch (err: any) {
        // Ignore "already exists" errors
        if (err.message?.includes('already exists') || err.message?.includes('duplicate')) {
          results.push({ statement: statement.substring(0, 50) + '...', success: true, note: 'already exists' });
        } else {
          results.push({ statement: statement.substring(0, 50) + '...', success: false, error: err.message });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.info(`✅ Migration completed: ${successCount} success, ${failCount} failed`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: failCount === 0,
        message: `Migration completed: ${successCount} statements executed`,
        results,
      }),
    };

  } catch (err) {
    logger.error('❌ Migration failed:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
    };
  }
}
