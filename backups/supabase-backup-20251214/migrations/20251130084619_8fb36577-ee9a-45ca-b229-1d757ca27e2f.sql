-- Create cost anomalies history table
CREATE TABLE IF NOT EXISTS public.cost_anomalies_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scan_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_anomalies INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  medium_count INTEGER NOT NULL DEFAULT 0,
  low_count INTEGER NOT NULL DEFAULT 0,
  spike_count INTEGER NOT NULL DEFAULT 0,
  drop_count INTEGER NOT NULL DEFAULT 0,
  total_deviation_cost DECIMAL(15,2) DEFAULT 0,
  scan_duration_seconds INTEGER,
  status TEXT DEFAULT 'completed',
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cost_anomalies_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own organization anomaly history"
  ON public.cost_anomalies_history
  FOR SELECT
  USING (
    organization_id IN (
      SELECT get_user_organization(auth.uid())
    )
  );

CREATE POLICY "System can insert anomaly history"
  ON public.cost_anomalies_history
  FOR INSERT
  WITH CHECK (true);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_cost_anomalies_history_org_date 
  ON public.cost_anomalies_history(organization_id, scan_date DESC);