-- Índices estratégicos para melhorar performance

-- Índices para findings
CREATE INDEX IF NOT EXISTS idx_findings_org_severity ON findings(organization_id, severity);
CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(status);
CREATE INDEX IF NOT EXISTS idx_findings_created_at ON findings(created_at DESC);

-- Índices para daily_costs
CREATE INDEX IF NOT EXISTS idx_daily_costs_org_date ON daily_costs(organization_id, cost_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_costs_account_date ON daily_costs(aws_account_id, cost_date DESC);

-- Índices para endpoint_monitors  
CREATE INDEX IF NOT EXISTS idx_monitors_org_active ON endpoint_monitors(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_monitors_next_check ON endpoint_monitors(next_check_at) WHERE is_active = true;

-- Índices para endpoint_monitor_results
CREATE INDEX IF NOT EXISTS idx_monitor_results_monitor_time ON endpoint_monitor_results(monitor_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_results_success ON endpoint_monitor_results(monitor_id, success);

-- Índices para cost_recommendations
CREATE INDEX IF NOT EXISTS idx_cost_rec_org_status ON cost_recommendations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_cost_rec_priority ON cost_recommendations(priority, status);

-- Índices para security_scans
CREATE INDEX IF NOT EXISTS idx_security_scans_org_status ON security_scans(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_security_scans_created ON security_scans(created_at DESC);

-- Índices para audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- Índices para remediation_tickets (sem organization_id)
CREATE INDEX IF NOT EXISTS idx_tickets_status ON remediation_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON remediation_tickets(priority, status);

-- Índices para cost_anomalies
CREATE INDEX IF NOT EXISTS idx_anomalies_account_detected ON cost_anomalies(aws_account_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_status_severity ON cost_anomalies(status, severity);

-- Índices para well_architected_scores
CREATE INDEX IF NOT EXISTS idx_wa_scores_scan ON well_architected_scores(scan_id);
CREATE INDEX IF NOT EXISTS idx_wa_scores_pillar ON well_architected_scores(pillar, score);