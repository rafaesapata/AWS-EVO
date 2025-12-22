-- Add source field to findings table to differentiate between CloudTrail and Security Scan
ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'cloudtrail';

-- Add check constraint for source values
ALTER TABLE public.findings ADD CONSTRAINT findings_source_check 
  CHECK (source IN ('cloudtrail', 'security_scan'));

-- Add index for faster filtering by source
CREATE INDEX IF NOT EXISTS idx_findings_source ON public.findings(source);

-- Add scan_type field for more granular categorization
ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS scan_type text;

-- Create table for tracking security scan executions
CREATE TABLE IF NOT EXISTS public.security_scans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_type text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  findings_count integer DEFAULT 0,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  error_message text,
  scan_config jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on security_scans
ALTER TABLE public.security_scans ENABLE ROW LEVEL SECURITY;

-- Create policies for security_scans
CREATE POLICY "Allow public read access" ON public.security_scans FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.security_scans FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.security_scans FOR UPDATE USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_security_scans_updated_at
  BEFORE UPDATE ON public.security_scans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_security_scans_status ON public.security_scans(status);
CREATE INDEX IF NOT EXISTS idx_security_scans_started_at ON public.security_scans(started_at DESC);