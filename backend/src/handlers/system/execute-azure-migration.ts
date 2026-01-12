/**
 * Execute Azure Migration Handler
 * Creates Azure-specific tables for multi-cloud support
 */

import type { APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

// SQL statements as an array to avoid splitting issues
const AZURE_MIGRATION_STATEMENTS = [
  // Azure Activity Events table
  `CREATE TABLE IF NOT EXISTS azure_activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    azure_credential_id UUID NOT NULL REFERENCES azure_credentials(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    caller TEXT,
    caller_type TEXT,
    source_ip TEXT,
    correlation_id TEXT,
    operation_name TEXT,
    resource_id TEXT,
    resource_type TEXT,
    resource_group TEXT,
    status TEXT,
    risk_level TEXT DEFAULT 'low',
    risk_reasons TEXT[],
    raw_event JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_azure_activity_org ON azure_activity_events(organization_id)`,
  `CREATE INDEX IF NOT EXISTS idx_azure_activity_credential ON azure_activity_events(azure_credential_id)`,
  `CREATE INDEX IF NOT EXISTS idx_azure_activity_time ON azure_activity_events(event_time)`,
  `CREATE INDEX IF NOT EXISTS idx_azure_activity_risk ON azure_activity_events(risk_level)`,
  
  // Azure WAF Events table
  `CREATE TABLE IF NOT EXISTS azure_waf_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    azure_credential_id UUID NOT NULL REFERENCES azure_credentials(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    action TEXT NOT NULL,
    source_ip TEXT NOT NULL,
    country TEXT,
    region TEXT,
    user_agent TEXT,
    uri TEXT,
    http_method TEXT,
    rule_matched TEXT,
    threat_type TEXT,
    severity TEXT DEFAULT 'low',
    raw_log JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_azure_waf_org ON azure_waf_events(organization_id)`,
  `CREATE INDEX IF NOT EXISTS idx_azure_waf_credential ON azure_waf_events(azure_credential_id)`,
  `CREATE INDEX IF NOT EXISTS idx_azure_waf_time ON azure_waf_events(timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_azure_waf_ip ON azure_waf_events(source_ip)`,
  
  // Azure Reservations table
  `CREATE TABLE IF NOT EXISTS azure_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    azure_credential_id UUID NOT NULL REFERENCES azure_credentials(id) ON DELETE CASCADE,
    reservation_id TEXT NOT NULL UNIQUE,
    reservation_order_id TEXT,
    display_name TEXT,
    sku_name TEXT,
    sku_description TEXT,
    location TEXT,
    quantity INT,
    term TEXT,
    billing_scope_id TEXT,
    provisioning_state TEXT,
    effective_date TIMESTAMPTZ,
    expiry_date TIMESTAMPTZ,
    utilization_percentage FLOAT,
    benefit_start_time TIMESTAMPTZ,
    last_updated_time TIMESTAMPTZ,
    applied_scope_type TEXT,
    applied_scopes TEXT[],
    renew BOOLEAN DEFAULT false,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_azure_reservations_org ON azure_reservations(organization_id)`,
  `CREATE INDEX IF NOT EXISTS idx_azure_reservations_credential ON azure_reservations(azure_credential_id)`,
  `CREATE INDEX IF NOT EXISTS idx_azure_reservations_expiry ON azure_reservations(expiry_date)`,
  
  // Azure Defender Findings table
  `CREATE TABLE IF NOT EXISTS azure_defender_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    azure_credential_id UUID NOT NULL REFERENCES azure_credentials(id) ON DELETE CASCADE,
    alert_id TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    resource_id TEXT,
    resource_type TEXT,
    resource_group TEXT,
    subscription_id TEXT,
    status TEXT DEFAULT 'active',
    intent TEXT,
    compromised_entity TEXT,
    remediation_steps TEXT[],
    extended_properties JSONB,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    processing_end_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_azure_defender_unique ON azure_defender_findings(azure_credential_id, alert_id)`,
  `CREATE INDEX IF NOT EXISTS idx_azure_defender_org ON azure_defender_findings(organization_id)`,
  `CREATE INDEX IF NOT EXISTS idx_azure_defender_severity ON azure_defender_findings(severity)`,
  `CREATE INDEX IF NOT EXISTS idx_azure_defender_status ON azure_defender_findings(status)`,
  
  // Add cloud_provider columns to existing tables
  `ALTER TABLE well_architected_scores ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE well_architected_scores ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE compliance_checks ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE compliance_checks ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE compliance_scans ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE compliance_scans ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE cost_optimizations ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE cost_optimizations ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE predictive_incidents ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE predictive_incidents ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE predictive_incidents_history ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE predictive_incidents_history ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE ml_analysis_history ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE ml_analysis_history ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE resource_utilization_ml ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE resource_utilization_ml ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE drift_detections ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE drift_detections ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE drift_detection_history ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE drift_detection_history ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE waste_detections ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE waste_detections ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE compliance_violations ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE compliance_violations ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE iam_behavior_anomalies ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE iam_behavior_anomalies ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE monitored_endpoints ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE monitored_endpoints ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE monitored_resources ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE monitored_resources ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE edge_services ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
  `ALTER TABLE edge_services ADD COLUMN IF NOT EXISTS azure_credential_id UUID REFERENCES azure_credentials(id) ON DELETE SET NULL`,
  `ALTER TABLE edge_metrics ADD COLUMN IF NOT EXISTS cloud_provider TEXT DEFAULT 'AWS'`,
];

export async function handler(): Promise<APIGatewayProxyResultV2> {
  logger.info('Starting Azure migration');
  
  const prisma = getPrismaClient();
  const results: string[] = [];
  const errors: string[] = [];
  
  logger.info(`Executing ${AZURE_MIGRATION_STATEMENTS.length} SQL statements`);
  
  for (let i = 0; i < AZURE_MIGRATION_STATEMENTS.length; i++) {
    const sql = AZURE_MIGRATION_STATEMENTS[i];
    try {
      await prisma.$executeRawUnsafe(sql);
      results.push(`Statement ${i + 1}: OK`);
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error';
      // Ignore "already exists" errors
      if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
        results.push(`Statement ${i + 1}: SKIPPED (already exists)`);
      } else {
        errors.push(`Statement ${i + 1}: ${errorMsg}`);
        logger.error(`Migration error at statement ${i + 1}`, { error: errorMsg, sql: sql.substring(0, 100) });
      }
    }
  }
  
  // Verify tables were created
  const tables = await prisma.$queryRaw<Array<{table_name: string}>>`
    SELECT table_name FROM information_schema.tables 
    WHERE table_name LIKE 'azure_%' 
    ORDER BY table_name
  `;
  
  const tableNames = tables.map(t => t.table_name);
  
  logger.info('Azure migration completed', { 
    successCount: results.length, 
    errorCount: errors.length,
    azureTables: tableNames 
  });
  
  return {
    statusCode: errors.length > 0 ? 207 : 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      status: errors.length > 0 ? 'partial' : 'success',
      message: `Migration completed: ${results.length} successful, ${errors.length} errors`,
      results,
      errors,
      azureTables: tableNames,
    }),
  };
}
