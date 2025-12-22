-- Create CloudTrail scan history table
CREATE TABLE IF NOT EXISTS public.cloudtrail_scans_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  aws_account_id UUID REFERENCES public.aws_credentials(id) ON DELETE SET NULL,
  scan_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'completed',
  total_events INTEGER NOT NULL DEFAULT 0,
  analyzed_events INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  medium_count INTEGER NOT NULL DEFAULT 0,
  low_count INTEGER NOT NULL DEFAULT 0,
  execution_time_seconds INTEGER,
  message TEXT,
  findings_summary JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cloudtrail_scans_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their org CloudTrail history"
  ON public.cloudtrail_scans_history
  FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Service role can insert CloudTrail history"
  ON public.cloudtrail_scans_history
  FOR INSERT
  WITH CHECK (true);

-- Index for fast queries
CREATE INDEX idx_cloudtrail_history_org_date 
  ON public.cloudtrail_scans_history(organization_id, scan_date DESC);