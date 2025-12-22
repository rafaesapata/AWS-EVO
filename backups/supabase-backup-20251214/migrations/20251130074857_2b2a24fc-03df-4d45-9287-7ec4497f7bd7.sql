-- Criar tabela para histórico de análises Well-Architected
CREATE TABLE IF NOT EXISTS public.well_architected_scans_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scan_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  overall_score NUMERIC NOT NULL DEFAULT 0,
  operational_excellence_score NUMERIC DEFAULT 0,
  security_score NUMERIC DEFAULT 0,
  reliability_score NUMERIC DEFAULT 0,
  performance_efficiency_score NUMERIC DEFAULT 0,
  cost_optimization_score NUMERIC DEFAULT 0,
  sustainability_score NUMERIC DEFAULT 0,
  total_checks INTEGER NOT NULL DEFAULT 0,
  checks_passed INTEGER NOT NULL DEFAULT 0,
  checks_failed INTEGER NOT NULL DEFAULT 0,
  critical_issues INTEGER NOT NULL DEFAULT 0,
  high_issues INTEGER NOT NULL DEFAULT 0,
  medium_issues INTEGER NOT NULL DEFAULT 0,
  low_issues INTEGER NOT NULL DEFAULT 0,
  execution_time_seconds NUMERIC,
  pillar_details JSONB,
  scan_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_wa_history_org_date ON public.well_architected_scans_history(organization_id, scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_wa_history_scan_id ON public.well_architected_scans_history(scan_id);

-- RLS policies
ALTER TABLE public.well_architected_scans_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org WA history"
  ON public.well_architected_scans_history
  FOR SELECT
  USING (
    organization_id = get_user_organization(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "System can insert WA history"
  ON public.well_architected_scans_history
  FOR INSERT
  WITH CHECK (true);