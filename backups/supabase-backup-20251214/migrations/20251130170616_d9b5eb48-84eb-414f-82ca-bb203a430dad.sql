-- Create anomaly detections history table for tracking
CREATE TABLE IF NOT EXISTS public.anomaly_detections_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scan_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_anomalies INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  medium_count INTEGER NOT NULL DEFAULT 0,
  low_count INTEGER NOT NULL DEFAULT 0,
  cost_anomalies_count INTEGER NOT NULL DEFAULT 0,
  usage_anomalies_count INTEGER NOT NULL DEFAULT 0,
  performance_anomalies_count INTEGER NOT NULL DEFAULT 0,
  multi_dimensional_count INTEGER NOT NULL DEFAULT 0,
  total_cost_impact DECIMAL(12, 2) DEFAULT 0,
  execution_time_seconds INTEGER,
  detection_summary JSONB,
  message TEXT,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.anomaly_detections_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their organization anomaly history"
  ON public.anomaly_detections_history
  FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_anomaly_history_org_date 
  ON public.anomaly_detections_history(organization_id, scan_date DESC);

-- Add comment
COMMENT ON TABLE public.anomaly_detections_history IS 'Historical record of all anomaly detection executions';