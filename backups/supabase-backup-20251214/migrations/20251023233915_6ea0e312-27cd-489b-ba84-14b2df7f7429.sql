-- Create alert_rules table for intelligent alerts
CREATE TABLE IF NOT EXISTS public.alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('threshold', 'anomaly', 'trending')),
  metric TEXT NOT NULL,
  condition JSONB NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notification_channels JSONB DEFAULT '["email"]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create alerts table for triggered alerts
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_rule_id UUID REFERENCES public.alert_rules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL,
  metric_value NUMERIC,
  threshold_value NUMERIC,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID
);

-- Create tagging_compliance table
CREATE TABLE IF NOT EXISTS public.tagging_compliance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES public.security_scans(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_arn TEXT,
  required_tags TEXT[] NOT NULL,
  missing_tags TEXT[] NOT NULL,
  compliance_status TEXT NOT NULL CHECK (compliance_status IN ('compliant', 'non_compliant', 'partial')),
  tags JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create pdf_reports table
CREATE TABLE IF NOT EXISTS public.pdf_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL CHECK (report_type IN ('executive', 'detailed', 'compliance', 'cost')),
  title TEXT NOT NULL,
  date_range JSONB,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed')),
  generated_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Create chat_history table for FinOps Copilot
CREATE TABLE IF NOT EXISTS public.chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  session_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create jira_integration table
CREATE TABLE IF NOT EXISTS public.jira_integration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.remediation_tickets(id) ON DELETE CASCADE,
  jira_issue_key TEXT NOT NULL,
  jira_issue_url TEXT,
  status TEXT,
  sync_status TEXT DEFAULT 'synced',
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tagging_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jira_integration ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public access" ON public.alert_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access" ON public.alerts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access" ON public.tagging_compliance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access" ON public.pdf_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access" ON public.chat_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access" ON public.jira_integration FOR ALL USING (true) WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON public.alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON public.alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_tagging_status ON public.tagging_compliance(compliance_status);
CREATE INDEX IF NOT EXISTS idx_chat_session ON public.chat_history(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_created ON public.chat_history(created_at);

-- Create trigger for updated_at
CREATE TRIGGER update_alert_rules_updated_at
  BEFORE UPDATE ON public.alert_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments
COMMENT ON TABLE public.alert_rules IS 'Configuration for intelligent alerts (threshold, anomaly, trending)';
COMMENT ON TABLE public.alerts IS 'Triggered alerts based on alert_rules';
COMMENT ON TABLE public.tagging_compliance IS 'AWS resource tagging compliance checks';
COMMENT ON TABLE public.pdf_reports IS 'Generated PDF reports for executives';
COMMENT ON TABLE public.chat_history IS 'FinOps Copilot chat conversation history';
COMMENT ON TABLE public.jira_integration IS 'Integration with Jira for remediation tickets';
