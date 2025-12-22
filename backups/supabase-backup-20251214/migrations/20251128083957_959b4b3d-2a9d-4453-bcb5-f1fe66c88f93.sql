-- =====================================================
-- EVENT-DRIVEN ARCHITECTURE
-- =====================================================

CREATE TABLE IF NOT EXISTS system_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    event_source TEXT NOT NULL,
    aggregate_id UUID,
    aggregate_type TEXT,
    organization_id UUID REFERENCES organizations(id),
    user_id UUID,
    event_data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT
);

CREATE INDEX idx_system_events_type_status ON system_events (event_type, processing_status) WHERE processing_status IN ('pending', 'failed');
CREATE INDEX idx_system_events_org_created ON system_events (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS system_health_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name TEXT NOT NULL,
    metric_value NUMERIC NOT NULL,
    metric_unit TEXT,
    tags JSONB DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_system_health_name_time ON system_health_metrics (metric_name, recorded_at DESC);

-- Multi-tenant optimizations
CREATE INDEX IF NOT EXISTS idx_findings_org_severity_covering ON findings (organization_id, severity, status) INCLUDE (created_at, event_name);
CREATE INDEX IF NOT EXISTS idx_cost_recommendations_org_covering ON cost_recommendations (organization_id, status) INCLUDE (created_at, title);

-- RLS Policies
ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_health_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view events in org" ON system_events FOR SELECT USING (organization_id = get_user_organization(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "System insert events" ON system_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Super admins view metrics" ON system_health_metrics FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "System insert metrics" ON system_health_metrics FOR INSERT WITH CHECK (true);