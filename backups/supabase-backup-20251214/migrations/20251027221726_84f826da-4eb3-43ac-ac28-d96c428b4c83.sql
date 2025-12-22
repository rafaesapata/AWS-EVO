-- Criar tabela de histórico de predições de incidentes
CREATE TABLE IF NOT EXISTS public.predictive_incidents_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  scan_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_predictions INTEGER NOT NULL DEFAULT 0,
  high_risk_count INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  execution_time_seconds NUMERIC,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Adicionar índices
CREATE INDEX IF NOT EXISTS idx_predictive_incidents_history_org ON public.predictive_incidents_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_predictive_incidents_history_scan_date ON public.predictive_incidents_history(scan_date DESC);

-- Adicionar organization_id na tabela predictive_incidents se não existir
ALTER TABLE public.predictive_incidents
ADD COLUMN IF NOT EXISTS organization_id UUID;

-- RLS para predictive_incidents_history
ALTER TABLE public.predictive_incidents_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own organization history"
  ON public.predictive_incidents_history
  FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Users can insert own organization history"
  ON public.predictive_incidents_history
  FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));