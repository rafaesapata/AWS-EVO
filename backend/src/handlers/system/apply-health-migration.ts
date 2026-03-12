/**
 * Temporary handler to apply health events migration via raw SQL.
 * DELETE THIS FILE after migration is applied.
 */

import type { APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

const MIGRATION_QUERIES = [
  `CREATE TABLE IF NOT EXISTS "aws_health_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "event_arn" TEXT NOT NULL,
    "type_code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6),
    "status_code" TEXT NOT NULL,
    "description" TEXT,
    "aws_account_id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "is_credential_exposure" BOOLEAN NOT NULL DEFAULT false,
    "remediation_ticket_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "aws_health_events_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "health_monitoring_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "auto_ticket_severities" TEXT[] DEFAULT ARRAY['critical', 'high']::TEXT[],
    "polling_frequency_minutes" INTEGER NOT NULL DEFAULT 15,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "health_monitoring_configs_pkey" PRIMARY KEY ("id")
  )`,
  // Unique constraint
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aws_health_events_event_arn_organization_id_key') THEN
      ALTER TABLE "aws_health_events" ADD CONSTRAINT "aws_health_events_event_arn_organization_id_key" UNIQUE ("event_arn", "organization_id");
    END IF;
  END $$`,
  // Unique constraint for config
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'health_monitoring_configs_organization_id_key') THEN
      ALTER TABLE "health_monitoring_configs" ADD CONSTRAINT "health_monitoring_configs_organization_id_key" UNIQUE ("organization_id");
    END IF;
  END $$`,
  // Indexes
  `CREATE INDEX IF NOT EXISTS "aws_health_events_organization_id_idx" ON "aws_health_events"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "aws_health_events_severity_idx" ON "aws_health_events"("severity")`,
  `CREATE INDEX IF NOT EXISTS "aws_health_events_status_code_idx" ON "aws_health_events"("status_code")`,
  `CREATE INDEX IF NOT EXISTS "aws_health_events_aws_account_id_idx" ON "aws_health_events"("aws_account_id")`,
  `CREATE INDEX IF NOT EXISTS "aws_health_events_is_credential_exposure_idx" ON "aws_health_events"("is_credential_exposure")`,
  `CREATE INDEX IF NOT EXISTS "aws_health_events_organization_id_status_code_idx" ON "aws_health_events"("organization_id", "status_code")`,
  `CREATE INDEX IF NOT EXISTS "aws_health_events_organization_id_severity_idx" ON "aws_health_events"("organization_id", "severity")`,
  `CREATE INDEX IF NOT EXISTS "health_monitoring_configs_organization_id_idx" ON "health_monitoring_configs"("organization_id")`,
  // Foreign keys
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aws_health_events_organization_id_fkey') THEN
      ALTER TABLE "aws_health_events" ADD CONSTRAINT "aws_health_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'health_monitoring_configs_organization_id_fkey') THEN
      ALTER TABLE "health_monitoring_configs" ADD CONSTRAINT "health_monitoring_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,
  // Register migration in _prisma_migrations table
  `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
   SELECT gen_random_uuid(), 'manual-health-events', '20260312_add_aws_health_events_monitoring', NOW(), 1
   WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20260312_add_aws_health_events_monitoring')`,
];

export async function handler(): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  try {
    logger.info('Starting health events migration');
    const prisma = getPrismaClient();
    let executed = 0;
    const errors: string[] = [];

    for (const query of MIGRATION_QUERIES) {
      try {
        await prisma.$executeRawUnsafe(query);
        executed++;
        logger.info('Query executed', { index: executed, preview: query.substring(0, 80) });
      } catch (err: any) {
        const msg = err.message || 'Unknown error';
        errors.push(`Query ${executed + 1}: ${msg}`);
        logger.error('Query failed', { index: executed + 1, error: msg });
      }
    }

    const duration = Date.now() - startTime;
    logger.info('Health events migration completed', { executed, errors: errors.length, duration_ms: duration });

    return success({
      success: errors.length === 0,
      message: errors.length === 0 ? 'Migration applied successfully' : 'Migration completed with errors',
      executed,
      total: MIGRATION_QUERIES.length,
      errors,
      duration_ms: duration,
    });
  } catch (err) {
    logger.error('Migration failed', { error: (err as Error).message });
    return error('Migration failed. Check logs.', 500);
  }
}
