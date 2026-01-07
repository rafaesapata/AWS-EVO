// Lambda para aplicar migração SQL no RDS
const { Client } = require('pg');
const fs = require('fs');

exports.handler = async (event) => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: 5432,
    user: 'postgres',
    password: process.env.DB_PASSWORD,
    database: 'evouds',
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Ler migração SQL
    const migration = `
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
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMPTZ(6),
    "implemented_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "ri_sp_recommendations_pkey" PRIMARY KEY ("id")
);

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
    "total_actual_cost" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ri_sp_utilization_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "reserved_instances_reserved_instance_id_key" ON "reserved_instances"("reserved_instance_id");
CREATE INDEX IF NOT EXISTS "reserved_instances_organization_id_idx" ON "reserved_instances"("organization_id");
CREATE INDEX IF NOT EXISTS "reserved_instances_aws_account_id_idx" ON "reserved_instances"("aws_account_id");
CREATE INDEX IF NOT EXISTS "reserved_instances_state_idx" ON "reserved_instances"("state");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "savings_plans_savings_plan_id_key" ON "savings_plans"("savings_plan_id");
CREATE INDEX IF NOT EXISTS "savings_plans_organization_id_idx" ON "savings_plans"("organization_id");
CREATE INDEX IF NOT EXISTS "savings_plans_aws_account_id_idx" ON "savings_plans"("aws_account_id");
CREATE INDEX IF NOT EXISTS "savings_plans_state_idx" ON "savings_plans"("state");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ri_sp_recommendations_organization_id_idx" ON "ri_sp_recommendations"("organization_id");
CREATE INDEX IF NOT EXISTS "ri_sp_recommendations_aws_account_id_idx" ON "ri_sp_recommendations"("aws_account_id");
CREATE INDEX IF NOT EXISTS "ri_sp_recommendations_status_idx" ON "ri_sp_recommendations"("status");
CREATE INDEX IF NOT EXISTS "ri_sp_recommendations_priority_idx" ON "ri_sp_recommendations"("priority");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ri_sp_utilization_history_organization_id_idx" ON "ri_sp_utilization_history"("organization_id");
CREATE INDEX IF NOT EXISTS "ri_sp_utilization_history_aws_account_id_idx" ON "ri_sp_utilization_history"("aws_account_id");
CREATE INDEX IF NOT EXISTS "ri_sp_utilization_history_resource_type_resource_id_idx" ON "ri_sp_utilization_history"("resource_type", "resource_id");
CREATE INDEX IF NOT EXISTS "ri_sp_utilization_history_period_start_period_end_idx" ON "ri_sp_utilization_history"("period_start", "period_end");
`;

    console.log('Executing migration...');
    await client.query(migration);
    console.log('Migration completed successfully');

    // Verificar tabelas criadas
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('reserved_instances', 'savings_plans', 'ri_sp_recommendations', 'ri_sp_utilization_history')
      ORDER BY table_name
    `);

    console.log('Tables created:', result.rows);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Migration applied successfully',
        tables: result.rows,
      }),
    };
  } catch (error) {
    console.error('Migration error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  } finally {
    await client.end();
  }
};
