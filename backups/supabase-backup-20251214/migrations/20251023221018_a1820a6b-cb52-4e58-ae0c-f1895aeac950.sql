-- Create Well-Architected Framework tables

-- Well-Architected Scores table
CREATE TABLE IF NOT EXISTS public.well_architected_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id uuid REFERENCES public.security_scans(id) ON DELETE CASCADE,
  pillar text NOT NULL,
  score numeric(5,2) NOT NULL DEFAULT 0,
  max_score numeric(5,2) NOT NULL DEFAULT 100,
  checks_passed integer DEFAULT 0,
  checks_failed integer DEFAULT 0,
  critical_issues integer DEFAULT 0,
  high_issues integer DEFAULT 0,
  medium_issues integer DEFAULT 0,
  low_issues integer DEFAULT 0,
  recommendations jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.well_architected_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON public.well_architected_scores FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.well_architected_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.well_architected_scores FOR UPDATE USING (true);

CREATE TRIGGER update_well_architected_scores_updated_at
  BEFORE UPDATE ON public.well_architected_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_well_architected_scores_scan_id ON public.well_architected_scores(scan_id);
CREATE INDEX IF NOT EXISTS idx_well_architected_scores_pillar ON public.well_architected_scores(pillar);

-- Update cost_recommendations for Well-Architected
ALTER TABLE public.cost_recommendations 
  ADD COLUMN IF NOT EXISTS well_architected_pillar text,
  ADD COLUMN IF NOT EXISTS compliance_frameworks text[],
  ADD COLUMN IF NOT EXISTS remediation_script text,
  ADD COLUMN IF NOT EXISTS business_impact text;

-- IAM findings table
CREATE TABLE IF NOT EXISTS public.iam_findings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id uuid REFERENCES public.security_scans(id) ON DELETE CASCADE,
  finding_type text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  resource_name text,
  severity text NOT NULL DEFAULT 'medium',
  details jsonb NOT NULL,
  recommendations text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.iam_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON public.iam_findings FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.iam_findings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.iam_findings FOR UPDATE USING (true);

CREATE INDEX IF NOT EXISTS idx_iam_findings_scan_id ON public.iam_findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_iam_findings_severity ON public.iam_findings(severity);

-- Compliance checks table  
CREATE TABLE IF NOT EXISTS public.compliance_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id uuid REFERENCES public.security_scans(id) ON DELETE CASCADE,
  framework text NOT NULL,
  control_id text NOT NULL,
  control_name text NOT NULL,
  status text NOT NULL,
  severity text,
  evidence jsonb,
  remediation_steps text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.compliance_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON public.compliance_checks FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.compliance_checks FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_compliance_checks_scan_id ON public.compliance_checks(scan_id);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_framework ON public.compliance_checks(framework);