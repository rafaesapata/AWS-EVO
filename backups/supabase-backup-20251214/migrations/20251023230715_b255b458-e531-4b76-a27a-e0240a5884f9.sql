-- Enable pg_cron and pg_net for scheduled scans
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Multi-account AWS credentials support
ALTER TABLE public.aws_credentials ADD COLUMN IF NOT EXISTS account_name text NOT NULL DEFAULT 'Default Account';
ALTER TABLE public.aws_credentials ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE public.aws_credentials ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Add account reference to scans
ALTER TABLE public.security_scans ADD COLUMN IF NOT EXISTS aws_account_id uuid REFERENCES public.aws_credentials(id);

-- Scheduled scans table
CREATE TABLE IF NOT EXISTS public.scheduled_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id uuid REFERENCES public.aws_credentials(id) ON DELETE CASCADE,
  scan_types text[] NOT NULL DEFAULT ARRAY['security', 'cost', 'well_architected'],
  schedule_cron text NOT NULL DEFAULT '0 2 * * *',
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamp with time zone,
  next_run_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.scheduled_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access to scheduled_scans" ON public.scheduled_scans FOR ALL USING (true) WITH CHECK (true);

-- Remediation tickets table
CREATE TABLE IF NOT EXISTS public.remediation_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id uuid REFERENCES public.findings(id) ON DELETE CASCADE,
  cost_recommendation_id uuid REFERENCES public.cost_recommendations(id) ON DELETE CASCADE,
  iam_finding_id uuid REFERENCES public.iam_findings(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'dismissed')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to text,
  estimated_savings numeric,
  resolution_notes text,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.remediation_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access to remediation_tickets" ON public.remediation_tickets FOR ALL USING (true) WITH CHECK (true);

-- Scan history metrics (for trending)
CREATE TABLE IF NOT EXISTS public.scan_history_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid REFERENCES public.security_scans(id) ON DELETE CASCADE,
  aws_account_id uuid REFERENCES public.aws_credentials(id),
  metric_date date NOT NULL DEFAULT CURRENT_DATE,
  overall_security_score numeric,
  well_architected_score numeric,
  total_findings integer DEFAULT 0,
  critical_findings integer DEFAULT 0,
  high_findings integer DEFAULT 0,
  total_cost_savings numeric DEFAULT 0,
  resolved_tickets integer DEFAULT 0,
  pending_tickets integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.scan_history_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access to scan_history_metrics" ON public.scan_history_metrics FOR ALL USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scheduled_scans_active ON public.scheduled_scans(is_active, next_run_at);
CREATE INDEX IF NOT EXISTS idx_remediation_tickets_status ON public.remediation_tickets(status);
CREATE INDEX IF NOT EXISTS idx_scan_history_date ON public.scan_history_metrics(metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON public.findings(severity, status);
CREATE INDEX IF NOT EXISTS idx_cost_recommendations_priority ON public.cost_recommendations(priority, status);

-- Triggers for updated_at
CREATE TRIGGER update_scheduled_scans_updated_at BEFORE UPDATE ON public.scheduled_scans 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_remediation_tickets_updated_at BEFORE UPDATE ON public.remediation_tickets 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to calculate and store daily metrics
CREATE OR REPLACE FUNCTION public.calculate_daily_metrics(p_scan_id uuid)
RETURNS void AS $$
DECLARE
  v_account_id uuid;
  v_wa_score numeric;
  v_total_findings integer;
  v_critical_findings integer;
  v_high_findings integer;
  v_total_savings numeric;
  v_resolved integer;
  v_pending integer;
BEGIN
  -- Get account ID from scan
  SELECT aws_account_id INTO v_account_id FROM public.security_scans WHERE id = p_scan_id;
  
  -- Calculate Well-Architected score
  SELECT AVG(score) INTO v_wa_score FROM public.well_architected_scores WHERE scan_id = p_scan_id;
  
  -- Count findings
  SELECT COUNT(*), 
         SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END),
         SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END)
  INTO v_total_findings, v_critical_findings, v_high_findings
  FROM public.findings WHERE scan_type = (SELECT scan_type FROM public.security_scans WHERE id = p_scan_id);
  
  -- Calculate total savings
  SELECT SUM(projected_savings_yearly) INTO v_total_savings 
  FROM public.cost_recommendations WHERE scan_id = p_scan_id;
  
  -- Count tickets
  SELECT 
    SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END),
    SUM(CASE WHEN status IN ('pending', 'in_progress') THEN 1 ELSE 0 END)
  INTO v_resolved, v_pending
  FROM public.remediation_tickets;
  
  -- Insert metrics
  INSERT INTO public.scan_history_metrics (
    scan_id, aws_account_id, metric_date, 
    well_architected_score, total_findings, critical_findings, high_findings,
    total_cost_savings, resolved_tickets, pending_tickets
  ) VALUES (
    p_scan_id, v_account_id, CURRENT_DATE,
    v_wa_score, v_total_findings, v_critical_findings, v_high_findings,
    v_total_savings, v_resolved, v_pending
  )
  ON CONFLICT (scan_id) DO UPDATE SET
    well_architected_score = EXCLUDED.well_architected_score,
    total_findings = EXCLUDED.total_findings,
    critical_findings = EXCLUDED.critical_findings,
    high_findings = EXCLUDED.high_findings,
    total_cost_savings = EXCLUDED.total_cost_savings,
    resolved_tickets = EXCLUDED.resolved_tickets,
    pending_tickets = EXCLUDED.pending_tickets;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add unique constraint for daily metrics
CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_history_metrics_unique ON public.scan_history_metrics(scan_id);