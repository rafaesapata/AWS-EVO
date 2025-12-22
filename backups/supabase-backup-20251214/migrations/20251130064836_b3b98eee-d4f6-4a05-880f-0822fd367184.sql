-- Create security scans history table
CREATE TABLE IF NOT EXISTS public.security_scans_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scan_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_findings INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  medium_count INTEGER NOT NULL DEFAULT 0,
  low_count INTEGER NOT NULL DEFAULT 0,
  services_scanned TEXT[] NOT NULL DEFAULT '{}',
  execution_time_seconds NUMERIC,
  findings_summary JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.security_scans_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for security_scans_history
CREATE POLICY "Users can view their organization's security scan history"
  ON public.security_scans_history
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "System can insert security scan history"
  ON public.security_scans_history
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM public.profiles 
      WHERE id = auth.uid()
    )
  );

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_security_scans_history_org_date 
  ON public.security_scans_history(organization_id, scan_date DESC);

-- Create index for organization lookups
CREATE INDEX IF NOT EXISTS idx_security_scans_history_organization 
  ON public.security_scans_history(organization_id);