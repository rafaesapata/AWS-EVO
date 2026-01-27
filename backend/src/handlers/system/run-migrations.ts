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
  
  // Add remediation_ticket_id to findings table (required for security-scan)
  `ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "remediation_ticket_id" UUID`,
  `CREATE INDEX IF NOT EXISTS "findings_remediation_ticket_id_idx" ON "findings"("remediation_ticket_id")`,
  
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
  
  // ML Waste Detection v3.0 - Add missing columns
  `ALTER TABLE "resource_utilization_ml" ADD COLUMN IF NOT EXISTS "resource_arn" VARCHAR(512)`,
  `ALTER TABLE "resource_utilization_ml" ADD COLUMN IF NOT EXISTS "resource_subtype" VARCHAR(100)`,
  `ALTER TABLE "resource_utilization_ml" ADD COLUMN IF NOT EXISTS "current_hourly_cost" DOUBLE PRECISION`,
  `ALTER TABLE "resource_utilization_ml" ADD COLUMN IF NOT EXISTS "recommendation_priority" INTEGER`,
  `ALTER TABLE "resource_utilization_ml" ADD COLUMN IF NOT EXISTS "potential_annual_savings" DOUBLE PRECISION`,
  `ALTER TABLE "resource_utilization_ml" ADD COLUMN IF NOT EXISTS "resource_metadata" JSONB`,
  `ALTER TABLE "resource_utilization_ml" ADD COLUMN IF NOT EXISTS "dependencies" JSONB`,
  `ALTER TABLE "resource_utilization_ml" ADD COLUMN IF NOT EXISTS "implementation_steps" JSONB`,
  `ALTER TABLE "resource_utilization_ml" ADD COLUMN IF NOT EXISTS "risk_assessment" VARCHAR(20)`,
  `ALTER TABLE "resource_utilization_ml" ADD COLUMN IF NOT EXISTS "last_activity_at" TIMESTAMPTZ`,
  `ALTER TABLE "resource_utilization_ml" ADD COLUMN IF NOT EXISTS "days_since_activity" INTEGER`,
  `ALTER TABLE "resource_utilization_ml" ADD COLUMN IF NOT EXISTS "aws_account_number" VARCHAR(20)`,
  
  // Fix unique constraint to use resource_arn instead of resource_id
  `ALTER TABLE "resource_utilization_ml" DROP CONSTRAINT IF EXISTS "resource_utilization_ml_unique"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "resource_utilization_ml_org_account_arn_key" ON "resource_utilization_ml"("organization_id", "aws_account_id", "resource_arn")`,
  `CREATE INDEX IF NOT EXISTS "resource_utilization_ml_arn_idx" ON "resource_utilization_ml"("resource_arn")`,
  
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
  
  // Cancel all currently running scans (for manual cleanup)
  `UPDATE "security_scans" SET status = 'cancelled', completed_at = NOW() WHERE status IN ('running', 'pending', 'starting')`,
  
  // Fix stuck cloudtrail analyses - mark as failed if running for more than 30 minutes (increased for longer periods)
  `UPDATE "cloudtrail_analyses" SET status = 'failed', completed_at = NOW(), error_message = 'Timeout' WHERE status = 'running' AND started_at < NOW() - INTERVAL '30 minutes'`,
  
  // Add missing columns to cloudtrail_analyses
  `ALTER TABLE "cloudtrail_analyses" ADD COLUMN IF NOT EXISTS "period_start" TIMESTAMPTZ(6)`,
  `ALTER TABLE "cloudtrail_analyses" ADD COLUMN IF NOT EXISTS "period_end" TIMESTAMPTZ(6)`,
  `CREATE INDEX IF NOT EXISTS "cloudtrail_analyses_period_idx" ON "cloudtrail_analyses"("period_start", "period_end")`,
  
  // Add security explanation and remediation columns to cloudtrail_events
  `ALTER TABLE "cloudtrail_events" ADD COLUMN IF NOT EXISTS "security_explanation" TEXT`,
  `ALTER TABLE "cloudtrail_events" ADD COLUMN IF NOT EXISTS "remediation_suggestion" TEXT`,
  `ALTER TABLE "cloudtrail_events" ADD COLUMN IF NOT EXISTS "event_category" TEXT`,
  
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
  
  // Predictive Incidents (ML) tables
  `CREATE TABLE IF NOT EXISTS "predictive_incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "aws_account_id" UUID,
    "resource_id" TEXT,
    "resource_name" TEXT,
    "resource_type" TEXT,
    "region" TEXT,
    "incident_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "probability" INTEGER NOT NULL,
    "confidence_score" INTEGER NOT NULL,
    "timeframe" TEXT,
    "time_to_incident_hours" INTEGER,
    "description" TEXT NOT NULL,
    "recommendation" TEXT,
    "recommended_actions" TEXT,
    "contributing_factors" JSONB,
    "indicators" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "mitigated_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "predictive_incidents_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "predictive_incidents_organization_id_idx" ON "predictive_incidents"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "predictive_incidents_aws_account_id_idx" ON "predictive_incidents"("aws_account_id")`,
  `CREATE INDEX IF NOT EXISTS "predictive_incidents_severity_idx" ON "predictive_incidents"("severity")`,
  `CREATE INDEX IF NOT EXISTS "predictive_incidents_incident_type_idx" ON "predictive_incidents"("incident_type")`,
  `CREATE INDEX IF NOT EXISTS "predictive_incidents_status_idx" ON "predictive_incidents"("status")`,
  `CREATE INDEX IF NOT EXISTS "predictive_incidents_probability_idx" ON "predictive_incidents"("probability")`,
  `CREATE INDEX IF NOT EXISTS "predictive_incidents_created_at_idx" ON "predictive_incidents"("created_at")`,
  
  `CREATE TABLE IF NOT EXISTS "predictive_incidents_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "aws_account_id" UUID,
    "total_predictions" INTEGER NOT NULL DEFAULT 0,
    "critical_count" INTEGER NOT NULL DEFAULT 0,
    "high_risk_count" INTEGER NOT NULL DEFAULT 0,
    "medium_count" INTEGER NOT NULL DEFAULT 0,
    "low_count" INTEGER NOT NULL DEFAULT 0,
    "execution_time_seconds" DOUBLE PRECISION,
    "message" TEXT,
    "alerts_analyzed" INTEGER,
    "findings_analyzed" INTEGER,
    "drifts_analyzed" INTEGER,
    "cost_points_analyzed" INTEGER,
    "scan_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "predictive_incidents_history_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "predictive_incidents_history_organization_id_idx" ON "predictive_incidents_history"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "predictive_incidents_history_aws_account_id_idx" ON "predictive_incidents_history"("aws_account_id")`,
  `CREATE INDEX IF NOT EXISTS "predictive_incidents_history_scan_date_idx" ON "predictive_incidents_history"("scan_date")`,
  
  // WAF Monitoring tables
  `CREATE TABLE IF NOT EXISTS "waf_monitoring_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "aws_account_id" UUID NOT NULL,
    "web_acl_arn" TEXT NOT NULL,
    "web_acl_name" TEXT NOT NULL,
    "log_group_name" TEXT NOT NULL,
    "subscription_filter" TEXT,
    "filter_mode" TEXT NOT NULL DEFAULT 'block_only',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_event_at" TIMESTAMPTZ(6),
    "events_today" INTEGER NOT NULL DEFAULT 0,
    "blocked_today" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "waf_monitoring_configs_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "waf_monitoring_configs_organization_id_web_acl_arn_key" ON "waf_monitoring_configs"("organization_id", "web_acl_arn")`,
  `CREATE INDEX IF NOT EXISTS "waf_monitoring_configs_organization_id_idx" ON "waf_monitoring_configs"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "waf_monitoring_configs_aws_account_id_idx" ON "waf_monitoring_configs"("aws_account_id")`,
  
  `CREATE TABLE IF NOT EXISTS "waf_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "aws_account_id" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,
    "action" TEXT NOT NULL,
    "source_ip" TEXT NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "user_agent" TEXT,
    "uri" TEXT NOT NULL,
    "http_method" TEXT NOT NULL,
    "rule_matched" TEXT,
    "threat_type" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'low',
    "is_campaign" BOOLEAN NOT NULL DEFAULT false,
    "campaign_id" UUID,
    "raw_log" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "waf_events_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "waf_events_organization_id_idx" ON "waf_events"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "waf_events_timestamp_idx" ON "waf_events"("timestamp")`,
  `CREATE INDEX IF NOT EXISTS "waf_events_source_ip_idx" ON "waf_events"("source_ip")`,
  `CREATE INDEX IF NOT EXISTS "waf_events_threat_type_idx" ON "waf_events"("threat_type")`,
  `CREATE INDEX IF NOT EXISTS "waf_events_severity_idx" ON "waf_events"("severity")`,
  `CREATE INDEX IF NOT EXISTS "waf_events_organization_id_timestamp_idx" ON "waf_events"("organization_id", "timestamp")`,
  
  `CREATE TABLE IF NOT EXISTS "waf_attack_campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "source_ip" TEXT NOT NULL,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6),
    "event_count" INTEGER NOT NULL DEFAULT 1,
    "attack_types" TEXT[],
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "auto_blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocked_at" TIMESTAMPTZ(6),
    "unblocked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "waf_attack_campaigns_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "waf_attack_campaigns_organization_id_idx" ON "waf_attack_campaigns"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "waf_attack_campaigns_source_ip_idx" ON "waf_attack_campaigns"("source_ip")`,
  `CREATE INDEX IF NOT EXISTS "waf_attack_campaigns_status_idx" ON "waf_attack_campaigns"("status")`,
  
  `CREATE TABLE IF NOT EXISTS "waf_blocked_ips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "ip_address" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "blocked_by" TEXT NOT NULL,
    "blocked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "waf_ip_set_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "waf_blocked_ips_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "waf_blocked_ips_organization_id_ip_address_key" ON "waf_blocked_ips"("organization_id", "ip_address")`,
  `CREATE INDEX IF NOT EXISTS "waf_blocked_ips_organization_id_idx" ON "waf_blocked_ips"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "waf_blocked_ips_expires_at_idx" ON "waf_blocked_ips"("expires_at")`,
  
  `CREATE TABLE IF NOT EXISTS "waf_alert_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "sns_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sns_topic_arn" TEXT,
    "slack_enabled" BOOLEAN NOT NULL DEFAULT false,
    "slack_webhook_url" TEXT,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "campaign_threshold" INTEGER NOT NULL DEFAULT 10,
    "campaign_window_mins" INTEGER NOT NULL DEFAULT 5,
    "auto_block_enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_block_threshold" INTEGER NOT NULL DEFAULT 50,
    "block_duration_hours" INTEGER NOT NULL DEFAULT 24,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "waf_alert_configs_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "waf_alert_configs_organization_id_key" ON "waf_alert_configs"("organization_id")`,
  
  // Knowledge Base Articles - Add missing columns for approval workflow
  `ALTER TABLE "knowledge_base_articles" ADD COLUMN IF NOT EXISTS "approval_status" TEXT NOT NULL DEFAULT 'draft'`,
  `ALTER TABLE "knowledge_base_articles" ADD COLUMN IF NOT EXISTS "approved_by" UUID`,
  `ALTER TABLE "knowledge_base_articles" ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMPTZ(6)`,
  `ALTER TABLE "knowledge_base_articles" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT`,
  `ALTER TABLE "knowledge_base_articles" ADD COLUMN IF NOT EXISTS "is_public" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "knowledge_base_articles" ADD COLUMN IF NOT EXISTS "is_restricted" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS "knowledge_base_articles_approval_status_idx" ON "knowledge_base_articles"("approval_status")`,
  
  // Knowledge Base Comments table
  `CREATE TABLE IF NOT EXISTS "knowledge_base_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "article_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "user_name" VARCHAR(255),
    "user_email" VARCHAR(255),
    "content" TEXT NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_base_comments_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "knowledge_base_comments_article_id_idx" ON "knowledge_base_comments"("article_id")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_base_comments_user_id_idx" ON "knowledge_base_comments"("user_id")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_base_comments_parent_id_idx" ON "knowledge_base_comments"("parent_id")`,
  
  // Knowledge Base Favorites table
  `CREATE TABLE IF NOT EXISTS "knowledge_base_favorites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "article_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_base_favorites_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_base_favorites_article_user_key" ON "knowledge_base_favorites"("article_id", "user_id")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_base_favorites_user_id_idx" ON "knowledge_base_favorites"("user_id")`,
  `CREATE INDEX IF NOT EXISTS "knowledge_base_favorites_article_id_idx" ON "knowledge_base_favorites"("article_id")`,
  
  // MFA Factors table
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
  `CREATE INDEX IF NOT EXISTS "mfa_factors_user_id_idx" ON "mfa_factors"("user_id")`,
  `CREATE INDEX IF NOT EXISTS "mfa_factors_is_active_idx" ON "mfa_factors"("is_active")`,
  
  // ==================== AZURE MULTI-CLOUD SUPPORT (2026-01-12) ====================
  
  // CloudProvider enum
  `DO $$ BEGIN
    CREATE TYPE "CloudProvider" AS ENUM ('AWS', 'AZURE', 'GCP');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$`,
  
  // Azure Credentials table
  `CREATE TABLE IF NOT EXISTS "azure_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "subscription_name" TEXT,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT NOT NULL,
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "azure_credentials_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "azure_credentials_organization_id_subscription_id_key" ON "azure_credentials"("organization_id", "subscription_id")`,
  `CREATE INDEX IF NOT EXISTS "azure_credentials_organization_id_idx" ON "azure_credentials"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "azure_credentials_subscription_id_idx" ON "azure_credentials"("subscription_id")`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'azure_credentials_organization_id_fkey') THEN
      ALTER TABLE "azure_credentials" ADD CONSTRAINT "azure_credentials_organization_id_fkey" 
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,
  
  // Add cloud_provider and azure_credential_id to findings
  `ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "cloud_provider" "CloudProvider" DEFAULT 'AWS'`,
  `ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "azure_credential_id" UUID`,
  `CREATE INDEX IF NOT EXISTS "findings_cloud_provider_idx" ON "findings"("cloud_provider")`,
  
  // Add cloud_provider and azure_credential_id to security_scans
  `ALTER TABLE "security_scans" ADD COLUMN IF NOT EXISTS "cloud_provider" "CloudProvider" DEFAULT 'AWS'`,
  `ALTER TABLE "security_scans" ADD COLUMN IF NOT EXISTS "azure_credential_id" UUID`,
  `CREATE INDEX IF NOT EXISTS "security_scans_cloud_provider_idx" ON "security_scans"("cloud_provider")`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'security_scans_azure_credential_id_fkey') THEN
      ALTER TABLE "security_scans" ADD CONSTRAINT "security_scans_azure_credential_id_fkey" 
        FOREIGN KEY ("azure_credential_id") REFERENCES "azure_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END $$`,
  
  // Add cloud_provider and azure_credential_id to daily_costs
  `ALTER TABLE "daily_costs" ADD COLUMN IF NOT EXISTS "cloud_provider" "CloudProvider" DEFAULT 'AWS'`,
  `ALTER TABLE "daily_costs" ADD COLUMN IF NOT EXISTS "azure_credential_id" UUID`,
  `CREATE INDEX IF NOT EXISTS "daily_costs_cloud_provider_idx" ON "daily_costs"("cloud_provider")`,
  
  // Add cloud_provider and azure_credential_id to resource_inventory
  `ALTER TABLE "resource_inventory" ADD COLUMN IF NOT EXISTS "cloud_provider" "CloudProvider" DEFAULT 'AWS'`,
  `ALTER TABLE "resource_inventory" ADD COLUMN IF NOT EXISTS "azure_credential_id" UUID`,
  `CREATE INDEX IF NOT EXISTS "resource_inventory_cloud_provider_idx" ON "resource_inventory"("cloud_provider")`,
  
  // ==================== AZURE OAUTH SUPPORT (2026-01-12) ====================
  
  // Add OAuth fields to azure_credentials table
  `ALTER TABLE "azure_credentials" ADD COLUMN IF NOT EXISTS "auth_type" VARCHAR(50) DEFAULT 'service_principal'`,
  `ALTER TABLE "azure_credentials" ADD COLUMN IF NOT EXISTS "encrypted_refresh_token" TEXT`,
  `ALTER TABLE "azure_credentials" ADD COLUMN IF NOT EXISTS "token_expires_at" TIMESTAMPTZ`,
  `ALTER TABLE "azure_credentials" ADD COLUMN IF NOT EXISTS "oauth_tenant_id" VARCHAR(100)`,
  `ALTER TABLE "azure_credentials" ADD COLUMN IF NOT EXISTS "oauth_user_email" VARCHAR(255)`,
  `ALTER TABLE "azure_credentials" ADD COLUMN IF NOT EXISTS "last_refresh_at" TIMESTAMPTZ`,
  `ALTER TABLE "azure_credentials" ADD COLUMN IF NOT EXISTS "refresh_error" TEXT`,
  
  // Make tenant_id, client_id, client_secret optional (for OAuth credentials)
  `ALTER TABLE "azure_credentials" ALTER COLUMN "tenant_id" DROP NOT NULL`,
  `ALTER TABLE "azure_credentials" ALTER COLUMN "client_id" DROP NOT NULL`,
  `ALTER TABLE "azure_credentials" ALTER COLUMN "client_secret" DROP NOT NULL`,
  
  // Add index on auth_type for filtering
  `CREATE INDEX IF NOT EXISTS "azure_credentials_auth_type_idx" ON "azure_credentials"("auth_type")`,
  
  // Create oauth_states table for CSRF protection during OAuth flow
  `CREATE TABLE IF NOT EXISTS "oauth_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "state" VARCHAR(255) NOT NULL,
    "code_verifier" VARCHAR(255) NOT NULL,
    "redirect_uri" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
  )`,
  
  // Create indexes for oauth_states
  `CREATE UNIQUE INDEX IF NOT EXISTS "oauth_states_state_key" ON "oauth_states"("state")`,
  `CREATE INDEX IF NOT EXISTS "oauth_states_expires_at_idx" ON "oauth_states"("expires_at")`,
  `CREATE INDEX IF NOT EXISTS "oauth_states_organization_id_idx" ON "oauth_states"("organization_id")`,
  
  // ==================== WAF AI ANALYSIS TABLE (2026-01-15) ====================
  
  // WAF AI Analysis table for persisting AI-generated traffic analysis
  `CREATE TABLE IF NOT EXISTS "waf_ai_analyses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "analysis" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "risk_level" VARCHAR(50),
    "ai_model" VARCHAR(100),
    "is_fallback" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "waf_ai_analyses_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "waf_ai_analyses_organization_id_idx" ON "waf_ai_analyses"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "waf_ai_analyses_org_created_idx" ON "waf_ai_analyses"("organization_id", "created_at" DESC)`,
  
  // ==================== DEMO MODE SUPPORT (2026-01-22) ====================
  
  // Add demo mode fields to organizations table
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "demo_mode" BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "demo_activated_at" TIMESTAMPTZ`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "demo_expires_at" TIMESTAMPTZ`,
  `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "demo_activated_by" UUID`,
  `CREATE INDEX IF NOT EXISTS "idx_organizations_demo_mode" ON "organizations"("demo_mode") WHERE demo_mode = TRUE`,
  
  // Demo Mode Audit table
  `CREATE TABLE IF NOT EXISTS "demo_mode_audit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "performed_by" UUID,
    "previous_state" JSONB,
    "new_state" JSONB,
    "reason" TEXT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "demo_mode_audit_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_demo_mode_audit_org" ON "demo_mode_audit"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "idx_demo_mode_audit_created" ON "demo_mode_audit"("created_at")`,
  `DO $ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_mode_audit_organization_id_fkey') THEN
      ALTER TABLE "demo_mode_audit" ADD CONSTRAINT "demo_mode_audit_organization_id_fkey" 
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $`,
  
  // ==================== SCAN SCHEDULES TABLE (2026-01-19) ====================
  
  // Scan Schedules table for automated security scan scheduling
  `CREATE TABLE IF NOT EXISTS "scan_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "aws_account_id" UUID NOT NULL,
    "scan_type" TEXT NOT NULL,
    "schedule_type" TEXT NOT NULL,
    "schedule_config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMPTZ(6),
    "next_run_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scan_schedules_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "scan_schedules_organization_id_idx" ON "scan_schedules"("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "scan_schedules_is_active_idx" ON "scan_schedules"("is_active")`,
  `CREATE INDEX IF NOT EXISTS "scan_schedules_next_run_at_idx" ON "scan_schedules"("next_run_at")`,
  `DO $ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scan_schedules_organization_id_fkey') THEN
      ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_organization_id_fkey" 
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $`,
  `DO $ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scan_schedules_aws_account_id_fkey') THEN
      ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_aws_account_id_fkey" 
        FOREIGN KEY ("aws_account_id") REFERENCES "aws_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $`,
  
  // ==================== FIX EXPIRED TRIAL LICENSES (2026-01-25) ====================
  // Generic fix for trial licenses that expired too early (should be 14 days, not 1 day)
  // This was caused by external API returning incorrect valid_until dates
  // Only affects organizations where the license expired within 7 days of creation
  `UPDATE "licenses" 
   SET 
     is_active = true,
     is_expired = false,
     valid_from = NOW(),
     valid_until = NOW() + INTERVAL '14 days',
     days_remaining = 14,
     max_users = GREATEST(max_users, 3),
     available_seats = GREATEST(max_users, 3) - used_seats,
     updated_at = NOW()
   WHERE is_trial = true 
     AND is_expired = true 
     AND created_at > NOW() - INTERVAL '7 days'
     AND valid_until < NOW()`,
  
  // ==================== ACTIVATE DEMO MODE FOR ARTHURTESTE (2026-01-25) ====================
  // Activate demo mode for organization ArthurTeste to allow navigation without cloud accounts
  // FIXED: Changed from 7 days to 30 days as per demo mode default configuration
  `UPDATE "organizations" 
   SET 
     demo_mode = true,
     demo_activated_at = NOW(),
     demo_expires_at = NOW() + INTERVAL '30 days'
   WHERE id = '101d2418-cbcf-43e4-bf74-390f71f2e2bd'`,

  // ==================== FIX DEMO EXPIRATION FOR ARTHURTESTE (2026-01-25) ====================
  // Fix: Update demo_expires_at to 30 days from now (was incorrectly set to 7 days)
  `UPDATE "organizations" 
   SET 
     demo_expires_at = NOW() + INTERVAL '30 days'
   WHERE id = '101d2418-cbcf-43e4-bf74-390f71f2e2bd' 
     AND demo_mode = true`,
];

export async function handler(event?: AuthorizedEvent): Promise<APIGatewayProxyResultV2> {
  logger.info('Starting database migration');
  
  // SECURITY: If event is provided with auth headers, require super_admin authentication
  // Allow direct Lambda invocation without auth (for deployment scripts)
  const hasAuthHeaders = event?.headers?.authorization || event?.headers?.Authorization;
  
  if (hasAuthHeaders) {
    let user;
    try {
      user = getUserFromEvent(event!);
    } catch {
      logger.warn('Unauthorized migration attempt');
      return error('Unauthorized', 401);
    }
    
    if (!isSuperAdmin(user)) {
      logger.warn('Forbidden migration attempt', { userId: user.sub });
      return error('Forbidden - Super admin required', 403);
    }
    
    logger.info('Migration authorized', { userId: user.sub });
  } else {
    logger.info('Direct Lambda invocation - skipping auth');
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
