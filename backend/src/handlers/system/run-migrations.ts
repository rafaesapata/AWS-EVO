/**
 * Lambda handler para executar migrações do Prisma
 * Usado para aplicar schema no RDS em subnet privada
 */

import type { APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

// SQL de migração inicial - cada comando separado
const MIGRATION_COMMANDS = [
  // Add aws_account_id to findings table (new migration)
  `ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "aws_account_id" UUID`,
  `CREATE INDEX IF NOT EXISTS "findings_aws_account_id_idx" ON "findings"("aws_account_id")`,
  
  // Organizations
  `CREATE TABLE IF NOT EXISTS "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
  )`,
  
  // Profiles
  `CREATE TABLE IF NOT EXISTS "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "full_name" TEXT,
    "avatar_url" TEXT,
    "role" TEXT DEFAULT 'user',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
  )`,
  
  // AWS Credentials
  `CREATE TABLE IF NOT EXISTS "aws_credentials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "account_id" TEXT,
    "account_name" TEXT,
    "access_key_id" TEXT,
    "secret_access_key" TEXT,
    "role_arn" TEXT,
    "external_id" TEXT,
    "session_token" TEXT,
    "regions" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "aws_credentials_pkey" PRIMARY KEY ("id")
  )`,
  
  // Indexes
  `CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "profiles_user_id_organization_id_key" ON "profiles"("user_id", "organization_id")`,
  
  // Foreign Keys (with error handling for duplicates)
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_organization_id_fkey') THEN
      ALTER TABLE "profiles" ADD CONSTRAINT "profiles_organization_id_fkey" 
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,
  
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aws_credentials_organization_id_fkey') THEN
      ALTER TABLE "aws_credentials" ADD CONSTRAINT "aws_credentials_organization_id_fkey" 
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,
];

export async function handler(): Promise<APIGatewayProxyResultV2> {
  logger.info('Starting database migration');
  
  try {
    const prisma = getPrismaClient();
    
    // Test connection
    await prisma.$queryRaw`SELECT 1 as test`;
    logger.info('Database connection successful');
    
    // Apply each migration command
    const results: string[] = [];
    for (let i = 0; i < MIGRATION_COMMANDS.length; i++) {
      const cmd = MIGRATION_COMMANDS[i];
      try {
        await prisma.$executeRawUnsafe(cmd);
        results.push(`Command ${i + 1}: OK`);
        logger.info(`Migration command ${i + 1} executed successfully`);
      } catch (err: any) {
        // Log but continue on non-critical errors
        results.push(`Command ${i + 1}: ${err.message}`);
        logger.warn(`Migration command ${i + 1} warning: ${err.message}`);
      }
    }
    
    // Check tables
    const tables = await prisma.$queryRaw<Array<{tablename: string}>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    
    logger.info('Tables after migration', { tables: tables.map(t => t.tablename) });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        status: 'success',
        message: 'Migration completed',
        results,
        tables: tables.map(t => t.tablename),
      }),
    };
  } catch (err: any) {
    logger.error('Migration error', err);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        status: 'error',
        message: err.message,
        code: err.code,
      }),
    };
  }
}
