/**
 * Lambda handler para executar migrações do Prisma
 * Usado para aplicar schema no RDS em subnet privada
 * SECURITY: Requires super_admin authentication
 */

import type { AuthorizedEvent, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getUserFromEvent, isSuperAdmin } from '../../lib/auth.js';
import { error } from '../../lib/response.js';

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
  
  // ML Analysis History table
  `CREATE TABLE IF NOT EXISTS "ml_analysis_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "aws_account_id" UUID NOT NULL,
    "aws_account_number" TEXT,
    "scan_type" TEXT NOT NULL DEFAULT 'ml-waste-detection',
    "status" TEXT NOT NULL DEFAULT 'running',
    "total_resources_analyzed" INTEGER NOT NULL DEFAULT 0,
    "total_recommendations" INTEGER NOT NULL DEFAULT 0,
    "total_monthly_savings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_annual_savings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "terminate_count" INTEGER NOT NULL DEFAULT 0,
    "downsize_count" INTEGER NOT NULL DEFAULT 0,
    "autoscale_count" INTEGER NOT NULL DEFAULT 0,
    "optimize_count" INTEGER NOT NULL DEFAULT 0,
    "migrate_count" INTEGER NOT NULL DEFAULT 0,
    "by_resource_type" JSONB,
    "regions_scanned" JSONB,
    "analysis_depth" TEXT,
    "execution_time_seconds" DOUBLE PRECISION,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ml_analysis_history_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "ml_analysis_history_organization_id_idx" ON "ml_analysis_history"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "ml_analysis_history_aws_account_id_idx" ON "ml_analysis_history"("aws_account_id")`,
  `CREATE INDEX IF NOT EXISTS "ml_analysis_history_scan_type_idx" ON "ml_analysis_history"("scan_type")`,
  `CREATE INDEX IF NOT EXISTS "ml_analysis_history_status_idx" ON "ml_analysis_history"("status")`,
  `CREATE INDEX IF NOT EXISTS "ml_analysis_history_started_at_idx" ON "ml_analysis_history"("started_at")`,

  // Fix stuck security scans - mark as failed if running for more than 30 minutes
  `UPDATE "security_scans" SET status = 'failed', completed_at = NOW() WHERE status = 'running' AND started_at < NOW() - INTERVAL '30 minutes'`,
  
  // Fix stuck cloudtrail analyses - mark as failed if running for more than 30 minutes (increased for longer periods)
  `UPDATE "cloudtrail_analyses" SET status = 'failed', completed_at = NOW(), error_message = 'Timeout' WHERE status = 'running' AND started_at < NOW() - INTERVAL '30 minutes'`,
  
  // Add missing columns to cloudtrail_analyses
  `ALTER TABLE "cloudtrail_analyses" ADD COLUMN IF NOT EXISTS "period_start" TIMESTAMPTZ(6)`,
  `ALTER TABLE "cloudtrail_analyses" ADD COLUMN IF NOT EXISTS "period_end" TIMESTAMPTZ(6)`,
  `CREATE INDEX IF NOT EXISTS "cloudtrail_analyses_period_idx" ON "cloudtrail_analyses"("period_start", "period_end")`,
  
  // Edge Services tables (CloudFront, WAF, Load Balancers)
  `CREATE TABLE IF NOT EXISTS "edge_services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "aws_account_id" UUID NOT NULL,
    "service_type" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "region" TEXT NOT NULL DEFAULT 'global',
    "domain_name" TEXT,
    "origin_domain" TEXT,
    "requests_per_minute" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cache_hit_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "error_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "blocked_requests" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "last_updated" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "edge_services_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "edge_services_org_account_service_key" ON "edge_services"("organization_id", "aws_account_id", "service_id")`,
  `CREATE INDEX IF NOT EXISTS "edge_services_organization_id_idx" ON "edge_services"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "edge_services_aws_account_id_idx" ON "edge_services"("aws_account_id")`,
  `CREATE INDEX IF NOT EXISTS "edge_services_service_type_idx" ON "edge_services"("service_type")`,
  
  `CREATE TABLE IF NOT EXISTS "edge_metrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "aws_account_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "cache_hits" INTEGER NOT NULL DEFAULT 0,
    "cache_misses" INTEGER NOT NULL DEFAULT 0,
    "blocked_requests" INTEGER NOT NULL DEFAULT 0,
    "response_time" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bandwidth_gb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "error_4xx" INTEGER NOT NULL DEFAULT 0,
    "error_5xx" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "edge_metrics_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "edge_metrics_service_timestamp_key" ON "edge_metrics"("service_id", "timestamp")`,
  `CREATE INDEX IF NOT EXISTS "edge_metrics_organization_id_idx" ON "edge_metrics"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "edge_metrics_aws_account_id_idx" ON "edge_metrics"("aws_account_id")`,
  `CREATE INDEX IF NOT EXISTS "edge_metrics_service_id_idx" ON "edge_metrics"("service_id")`,
  `CREATE INDEX IF NOT EXISTS "edge_metrics_timestamp_idx" ON "edge_metrics"("timestamp")`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'edge_metrics_service_id_fkey') THEN
      ALTER TABLE "edge_metrics" ADD CONSTRAINT "edge_metrics_service_id_fkey" 
        FOREIGN KEY ("service_id") REFERENCES "edge_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,
];

export async function handler(event?: AuthorizedEvent): Promise<APIGatewayProxyResultV2> {
  logger.info('Starting database migration');
  
  // SECURITY: If event is provided, require super_admin authentication
  if (event) {
    let user;
    try {
      user = getUserFromEvent(event);
    } catch {
      logger.warn('Unauthorized migration attempt');
      return error('Unauthorized', 401);
    }
    
    if (!isSuperAdmin(user)) {
      logger.warn('Forbidden migration attempt', { userId: user.sub });
      return error('Forbidden - Super admin required', 403);
    }
    
    logger.info('Migration authorized', { userId: user.sub });
  }
  
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
