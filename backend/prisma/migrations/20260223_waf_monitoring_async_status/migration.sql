-- AlterTable: Add status and status_message columns for async WAF monitoring setup
ALTER TABLE "waf_monitoring_configs" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "waf_monitoring_configs" ADD COLUMN "status_message" TEXT;
