-- Create drift detection history table
CREATE TABLE IF NOT EXISTS public.drift_detections_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  scan_date timestamp with time zone NOT NULL DEFAULT now(),
  total_drifts integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  modified_count integer NOT NULL DEFAULT 0,
  deleted_count integer NOT NULL DEFAULT 0,
  critical_count integer NOT NULL DEFAULT 0,
  high_count integer NOT NULL DEFAULT 0,
  execution_time_seconds numeric,
  message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.drift_detections_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their organization drift history"
ON public.drift_detections_history
FOR SELECT
USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Service role can insert drift history"
ON public.drift_detections_history
FOR INSERT
WITH CHECK (true);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_drift_history_org_date 
ON public.drift_detections_history(organization_id, scan_date DESC);