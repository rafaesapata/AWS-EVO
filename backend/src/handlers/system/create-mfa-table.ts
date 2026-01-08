/**
 * Lambda handler to create mfa_factors table
 * This is a one-time operation to fix the missing table issue
 */

import type { APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

const CREATE_MFA_TABLE_COMMANDS = [
  // Create mfa_factors table
  `CREATE TABLE IF NOT EXISTS "mfa_factors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "factor_type" VARCHAR(50) NOT NULL,
    "friendly_name" VARCHAR(255),
    "secret" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "verified_at" TIMESTAMPTZ(6),
    "deactivated_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mfa_factors_pkey" PRIMARY KEY ("id")
  )`,
  
  // Create indexes
  `CREATE INDEX IF NOT EXISTS "mfa_factors_user_id_idx" ON "mfa_factors"("user_id")`,
  `CREATE INDEX IF NOT EXISTS "mfa_factors_is_active_idx" ON "mfa_factors"("is_active")`,
  
  // Grant permissions to app user
  `DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evo_app_user') THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON "mfa_factors" TO evo_app_user;
    END IF;
  END $$`
];

export async function handler(): Promise<APIGatewayProxyResultV2> {
  logger.info('🔧 Creating mfa_factors table');
  
  try {
    const prisma = getPrismaClient();
    
    // Test connection
    await prisma.$queryRaw`SELECT 1 as test`;
    logger.info('✅ Database connection successful');
    
    // Check if table already exists
    const tableCheck = await prisma.$queryRaw<Array<{exists: boolean}>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'mfa_factors'
      ) as exists
    `;
    
    if (tableCheck[0]?.exists) {
      logger.info('ℹ️  Table mfa_factors already exists');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          status: 'success',
          message: 'Table mfa_factors already exists',
          alreadyExists: true
        }),
      };
    }
    
    // Execute table creation SQL commands
    logger.info('📝 Executing table creation SQL commands');
    
    for (let i = 0; i < CREATE_MFA_TABLE_COMMANDS.length; i++) {
      const cmd = CREATE_MFA_TABLE_COMMANDS[i];
      try {
        await prisma.$executeRawUnsafe(cmd);
        logger.info(`✅ Command ${i + 1}/${CREATE_MFA_TABLE_COMMANDS.length} executed`);
      } catch (err: any) {
        logger.error(`❌ Command ${i + 1} failed`, err);
        throw new Error(`Failed to execute command ${i + 1}: ${err.message}`);
      }
    }
    
    logger.info('✅ All table creation commands executed');
    
    // Verify table was created
    const verifyCheck = await prisma.$queryRaw<Array<{exists: boolean}>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'mfa_factors'
      ) as exists
    `;
    
    if (!verifyCheck[0]?.exists) {
      throw new Error('Table creation failed - table does not exist after execution');
    }
    
    // Get table structure
    const columns = await prisma.$queryRaw<Array<{column_name: string, data_type: string}>>`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'mfa_factors'
      ORDER BY ordinal_position
    `;
    
    logger.info('✅ Table mfa_factors created successfully', { 
      columns: columns.map(c => c.column_name) 
    });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        status: 'success',
        message: 'Table mfa_factors created successfully',
        columns: columns.map(c => ({ name: c.column_name, type: c.data_type }))
      }),
    };
    
  } catch (err: any) {
    logger.error('❌ Failed to create mfa_factors table', err);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        status: 'error',
        message: err.message || 'Failed to create table',
        error: err.toString()
      }),
    };
  }
}
