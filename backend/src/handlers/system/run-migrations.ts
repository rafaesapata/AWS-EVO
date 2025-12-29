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
  
  // ML Waste Detection table
  `CREATE TABLE IF NOT EXISTS "resource_utilization_ml" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "aws_account_id" UUID NOT NULL,
    "resource_id" VARCHAR(255) NOT NULL,
    "resource_name" VARCHAR(255),
    "resource_type" VARCHAR(100) NOT NULL,
    "region" VARCHAR(50) NOT NULL,
    "current_size" VARCHAR(100),
    "current_monthly_cost" DOUBLE PRECISION,
    "recommendation_type" VARCHAR(50),
    "recommended_size" VARCHAR(100),
    "potential_monthly_savings" DOUBLE PRECISION,
    "ml_confidence" DOUBLE PRECISION,
    "utilization_patterns" JSONB,
    "auto_scaling_eligible" BOOLEAN DEFAULT false,
    "auto_scaling_config" JSONB,
    "implementation_complexity" VARCHAR(20),
    "analyzed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resource_utilization_ml_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "resource_utilization_ml_unique" UNIQUE ("organization_id", "aws_account_id", "resource_id")
  )`,
  `CREATE INDEX IF NOT EXISTS "resource_utilization_ml_org_idx" ON "resource_utilization_ml"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "resource_utilization_ml_account_idx" ON "resource_utilization_ml"("aws_account_id")`,
  `CREATE INDEX IF NOT EXISTS "resource_utilization_ml_type_idx" ON "resource_utilization_ml"("recommendation_type")`,
  
  // Resource Monitoring tables
  `CREATE TABLE IF NOT EXISTS "monitored_resources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "aws_account_id" UUID NOT NULL,
    "resource_id" VARCHAR(255) NOT NULL,
    "resource_name" VARCHAR(255) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "region" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) DEFAULT 'unknown',
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "monitored_resources_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "monitored_resources_unique" UNIQUE ("organization_id", "aws_account_id", "resource_id", "resource_type")
  )`,
  `CREATE INDEX IF NOT EXISTS "monitored_resources_org_idx" ON "monitored_resources"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "monitored_resources_account_idx" ON "monitored_resources"("aws_account_id")`,
  `CREATE INDEX IF NOT EXISTS "monitored_resources_type_idx" ON "monitored_resources"("resource_type")`,
  
  `CREATE TABLE IF NOT EXISTS "resource_metrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "aws_account_id" UUID NOT NULL,
    "resource_id" VARCHAR(255) NOT NULL,
    "resource_name" VARCHAR(255),
    "resource_type" VARCHAR(100) NOT NULL,
    "metric_name" VARCHAR(100) NOT NULL,
    "metric_value" DOUBLE PRECISION NOT NULL,
    "metric_unit" VARCHAR(50),
    "timestamp" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resource_metrics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "resource_metrics_unique" UNIQUE ("organization_id", "aws_account_id", "resource_id", "metric_name", "timestamp")
  )`,
  `CREATE INDEX IF NOT EXISTS "resource_metrics_org_idx" ON "resource_metrics"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "resource_metrics_account_idx" ON "resource_metrics"("aws_account_id")`,
  `CREATE INDEX IF NOT EXISTS "resource_metrics_resource_idx" ON "resource_metrics"("resource_id")`,
  `CREATE INDEX IF NOT EXISTS "resource_metrics_timestamp_idx" ON "resource_metrics"("timestamp")`,
  
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

  // CloudTrail Events table
  `CREATE TABLE IF NOT EXISTS "cloudtrail_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "aws_account_id" UUID NOT NULL,
    "event_id" VARCHAR(255) NOT NULL,
    "event_name" VARCHAR(255) NOT NULL,
    "event_source" VARCHAR(255),
    "event_time" TIMESTAMPTZ(6) NOT NULL,
    "aws_region" VARCHAR(50),
    "source_ip_address" VARCHAR(100),
    "user_agent" TEXT,
    "user_identity" JSONB,
    "user_name" VARCHAR(255),
    "user_type" VARCHAR(100),
    "user_arn" TEXT,
    "error_code" VARCHAR(100),
    "error_message" TEXT,
    "request_parameters" JSONB,
    "response_elements" JSONB,
    "resources" JSONB,
    "risk_level" VARCHAR(20) DEFAULT 'low',
    "risk_reasons" TEXT[],
    "is_security_event" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cloudtrail_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cloudtrail_events_unique" UNIQUE ("organization_id", "event_id")
  )`,
  `CREATE INDEX IF NOT EXISTS "cloudtrail_events_org_idx" ON "cloudtrail_events"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "cloudtrail_events_account_idx" ON "cloudtrail_events"("aws_account_id")`,
  `CREATE INDEX IF NOT EXISTS "cloudtrail_events_event_time_idx" ON "cloudtrail_events"("event_time")`,
  `CREATE INDEX IF NOT EXISTS "cloudtrail_events_risk_level_idx" ON "cloudtrail_events"("risk_level")`,
  `CREATE INDEX IF NOT EXISTS "cloudtrail_events_user_name_idx" ON "cloudtrail_events"("user_name")`,
  `CREATE INDEX IF NOT EXISTS "cloudtrail_events_is_security_idx" ON "cloudtrail_events"("is_security_event")`,
  
  // CloudTrail Analyses table (for async analysis tracking)
  `CREATE TABLE IF NOT EXISTS "cloudtrail_analyses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "aws_account_id" UUID NOT NULL,
    "status" VARCHAR(50) DEFAULT 'pending',
    "hours_back" INTEGER DEFAULT 24,
    "max_results" INTEGER DEFAULT 5000,
    "events_processed" INTEGER,
    "events_saved" INTEGER,
    "critical_count" INTEGER,
    "high_count" INTEGER,
    "medium_count" INTEGER,
    "low_count" INTEGER,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cloudtrail_analyses_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "cloudtrail_analyses_org_idx" ON "cloudtrail_analyses"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "cloudtrail_analyses_account_idx" ON "cloudtrail_analyses"("aws_account_id")`,
  `CREATE INDEX IF NOT EXISTS "cloudtrail_analyses_status_idx" ON "cloudtrail_analyses"("status")`,
  
  // Fix stuck security scans - mark as failed if running for more than 30 minutes
  `UPDATE "security_scans" SET status = 'failed', completed_at = NOW() WHERE status = 'running' AND started_at < NOW() - INTERVAL '30 minutes'`,
  
  // Fix stuck cloudtrail analyses - mark as failed if running for more than 10 minutes
  `UPDATE "cloudtrail_analyses" SET status = 'failed', completed_at = NOW(), error_message = 'Timeout' WHERE status = 'running' AND started_at < NOW() - INTERVAL '10 minutes'`,
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
