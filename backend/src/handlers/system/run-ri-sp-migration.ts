/**
 * Run RI/SP Tables Migration
 * 
 * Creates the reserved_instances, savings_plans, ri_sp_recommendations, and ri_sp_utilization_history tables
 * in the production database.
 * 
 * This is a one-time migration handler.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const prisma = getPrismaClient();

    logger.info('Starting RI/SP tables migration...');

    // Execute the migration SQL
    await prisma.$executeRawUnsafe(`
      -- CreateTable
      CREATE TABLE IF NOT EXISTS "reserved_instances" (
          "id" UUID NOT NULL DEFAULT gen_random_uuid(),
          "organization_id" UUID NOT NULL,
          "aws_account_id" UUID NOT NULL,
          "aws_account_number" TEXT,
          "reserved_instance_id" TEXT NOT NULL,
          "instance_type" TEXT NOT NULL,
          "product_description" TEXT NOT NULL,
          "availability_zone" TEXT,
          "region" TEXT NOT NULL,
          "instance_count" INTEGER NOT NULL,
          "state" TEXT NOT NULL,
          "offering_class" TEXT NOT NULL,
          "offering_type" TEXT NOT NULL,
          "fixed_price" DOUBLE PRECISION,
          "usage_price" DOUBLE PRECISION,
          "recurring_charges" JSONB,
          "start_date" TIMESTAMPTZ(6) NOT NULL,
          "end_date" TIMESTAMPTZ(6) NOT NULL,
          "duration_seconds" INTEGER NOT NULL,
          "utilization_percentage" DOUBLE PRECISION,
          "hours_used" DOUBLE PRECISION,
          "hours_unused" DOUBLE PRECISION,
          "net_savings" DOUBLE PRECISION,
          "on_demand_cost_equivalent" DOUBLE PRECISION,
          "scope" TEXT,
          "tags" JSONB,
          "last_analyzed_at" TIMESTAMPTZ(6),
          "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMPTZ(6) NOT NULL,
          CONSTRAINT "reserved_instances_pkey" PRIMARY KEY ("id")
      );
    `);

    logger.info('Created reserved_instances table');

    await prisma.$executeRawUnsafe(`
      -- CreateTable
      CREATE TABLE IF NOT EXISTS "savings_plans" (
          "id" UUID NOT NULL DEFAULT gen_random_uuid(),
          "organization_id" UUID NOT NULL,
          "aws_account_id" UUID NOT NULL,
          "aws_account_number" TEXT,
          "savings_plan_id" TEXT NOT NULL,
          "savings_plan_arn" TEXT,
          "savings_plan_type" TEXT NOT NULL,
          "payment_option" TEXT NOT NULL,
          "commitment" DOUBLE PRECISION NOT NULL,
          "currency" TEXT NOT NULL DEFAULT 'USD',
          "region" TEXT,
          "instance_family" TEXT,
          "state" TEXT NOT NULL,
          "start_date" TIMESTAMPTZ(6) NOT NULL,
          "end_date" TIMESTAMPTZ(6) NOT NULL,
          "utilization_percentage" DOUBLE PRECISION,
          "coverage_percentage" DOUBLE PRECISION,
          "total_commitment_to_date" DOUBLE PRECISION,
          "used_commitment" DOUBLE PRECISION,
          "unused_commitment" DOUBLE PRECISION,
          "net_savings" DOUBLE PRECISION,
          "on_demand_cost_equivalent" DOUBLE PRECISION,
          "tags" JSONB,
          "offering_id" TEXT,
          "last_analyzed_at" TIMESTAMPTZ(6),
          "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMPTZ(6) NOT NULL,
          CONSTRAINT "savings_plans_pkey" PRIMARY KEY ("id")
      );
    `);

    logger.info('Created savings_plans table');

    await prisma.$executeRawUnsafe(`
      -- CreateTable
      CREATE TABLE IF NOT EXISTS "ri_sp_recommendations" (
          "id" UUID NOT NULL DEFAULT gen_random_uuid(),
          "organization_id" UUID NOT NULL,
          "aws_account_id" UUID NOT NULL,
          "recommendation_type" TEXT NOT NULL,
          "service" TEXT NOT NULL,
          "instance_type" TEXT,
          "region" TEXT,
          "platform" TEXT,
          "tenancy" TEXT,
          "offering_class" TEXT,
          "savings_plan_type" TEXT,
          "payment_option" TEXT,
          "term_years" INTEGER,
          "estimated_monthly_savings" DOUBLE PRECISION NOT NULL,
          "estimated_annual_savings" DOUBLE PRECISION NOT NULL,
          "upfront_cost" DOUBLE PRECISION,
          "estimated_monthly_cost" DOUBLE PRECISION,
          "estimated_roi_months" INTEGER,
          "lookback_period_days" INTEGER NOT NULL DEFAULT 30,
          "average_usage_hours" DOUBLE PRECISION,
          "normalized_units_per_hour" DOUBLE PRECISION,
          "recommended_units" INTEGER,
          "confidence_level" TEXT NOT NULL,
          "priority" INTEGER NOT NULL,
          "implementation_effort" TEXT NOT NULL,
          "implementation_steps" JSONB,
          "potential_risks" TEXT[],
          "recommendation_details" JSONB,
          "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "expires_at" TIMESTAMPTZ(6),
          "status" TEXT NOT NULL DEFAULT 'active',
          "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMPTZ(6) NOT NULL,
          CONSTRAINT "ri_sp_recommendations_pkey" PRIMARY KEY ("id")
      );
    `);

    logger.info('Created ri_sp_recommendations table');

    await prisma.$executeRawUnsafe(`
      -- CreateTable
      CREATE TABLE IF NOT EXISTS "ri_sp_utilization_history" (
          "id" UUID NOT NULL DEFAULT gen_random_uuid(),
          "organization_id" UUID NOT NULL,
          "aws_account_id" UUID NOT NULL,
          "resource_type" TEXT NOT NULL,
          "resource_id" TEXT NOT NULL,
          "period_start" TIMESTAMPTZ(6) NOT NULL,
          "period_end" TIMESTAMPTZ(6) NOT NULL,
          "utilization_percentage" DOUBLE PRECISION NOT NULL,
          "coverage_percentage" DOUBLE PRECISION,
          "hours_used" DOUBLE PRECISION,
          "hours_unused" DOUBLE PRECISION,
          "net_savings" DOUBLE PRECISION,
          "on_demand_cost_equivalent" DOUBLE PRECISION,
          "amortized_upfront_fee" DOUBLE PRECISION,
          "amortized_recurring_fee" DOUBLE PRECISION,
          "total_actual_cost" DOUBLE PRECISION,
          "instance_count" INTEGER,
          "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ri_sp_utilization_history_pkey" PRIMARY KEY ("id")
      );
    `);

    logger.info('Created ri_sp_utilization_history table');

    // Create indexes
    logger.info('Creating indexes...');

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "reserved_instances_reserved_instance_id_key" ON "reserved_instances"("reserved_instance_id");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "reserved_instances_organization_id_idx" ON "reserved_instances"("organization_id");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "reserved_instances_aws_account_id_idx" ON "reserved_instances"("aws_account_id");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "reserved_instances_state_idx" ON "reserved_instances"("state");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "reserved_instances_end_date_idx" ON "reserved_instances"("end_date");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "reserved_instances_utilization_percentage_idx" ON "reserved_instances"("utilization_percentage");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "savings_plans_savings_plan_id_key" ON "savings_plans"("savings_plan_id");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "savings_plans_organization_id_idx" ON "savings_plans"("organization_id");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "savings_plans_aws_account_id_idx" ON "savings_plans"("aws_account_id");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "savings_plans_state_idx" ON "savings_plans"("state");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "savings_plans_end_date_idx" ON "savings_plans"("end_date");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "savings_plans_utilization_percentage_idx" ON "savings_plans"("utilization_percentage");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "savings_plans_savings_plan_type_idx" ON "savings_plans"("savings_plan_type");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ri_sp_recommendations_organization_id_idx" ON "ri_sp_recommendations"("organization_id");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ri_sp_recommendations_aws_account_id_idx" ON "ri_sp_recommendations"("aws_account_id");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ri_sp_recommendations_recommendation_type_idx" ON "ri_sp_recommendations"("recommendation_type");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ri_sp_recommendations_status_idx" ON "ri_sp_recommendations"("status");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ri_sp_recommendations_estimated_annual_savings_idx" ON "ri_sp_recommendations"("estimated_annual_savings");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ri_sp_recommendations_priority_idx" ON "ri_sp_recommendations"("priority");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ri_sp_utilization_history_organization_id_resource_type_re_key" ON "ri_sp_utilization_history"("organization_id", "resource_type", "resource_id", "period_start");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ri_sp_utilization_history_organization_id_idx" ON "ri_sp_utilization_history"("organization_id");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ri_sp_utilization_history_aws_account_id_idx" ON "ri_sp_utilization_history"("aws_account_id");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ri_sp_utilization_history_resource_type_resource_id_idx" ON "ri_sp_utilization_history"("resource_type", "resource_id");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ri_sp_utilization_history_period_start_idx" ON "ri_sp_utilization_history"("period_start");
    `);

    logger.info('✅ RI/SP tables migration completed successfully');

    return success({
      success: true,
      message: 'RI/SP tables created successfully',
      tables: [
        'reserved_instances',
        'savings_plans',
        'ri_sp_recommendations',
        'ri_sp_utilization_history',
      ],
    });

  } catch (err) {
    logger.error('Error running RI/SP migration', err as Error);
    return error('Failed to run migration: ' + (err as Error).message);
  }
}
