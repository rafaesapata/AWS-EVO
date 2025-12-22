-- Verificar se a tabela predictive_incidents_history existe e criar se necessário
CREATE TABLE IF NOT EXISTS public.predictive_incidents_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scan_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_incidents INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  medium_count INTEGER NOT NULL DEFAULT 0,
  low_count INTEGER NOT NULL DEFAULT 0,
  next_48h_count INTEGER NOT NULL DEFAULT 0,
  next_week_count INTEGER NOT NULL DEFAULT 0,
  execution_time_seconds NUMERIC,
  prediction_summary JSONB,
  message TEXT,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.predictive_incidents_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy for organization isolation
CREATE POLICY "Users can view their organization's predictive incidents history"
  ON public.predictive_incidents_history
  FOR SELECT
  USING (organization_id IN (
    SELECT get_user_organization(auth.uid())
  ));

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_predictive_incidents_history_org_date 
  ON public.predictive_incidents_history(organization_id, scan_date DESC);