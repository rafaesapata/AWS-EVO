-- Add organization_id to security_posture table
ALTER TABLE public.security_posture 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Add organization_id to security_scans table  
ALTER TABLE public.security_scans
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Add organization_id to findings table (if it has aws_account_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'findings' 
    AND column_name = 'aws_account_id'
  ) THEN
    ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_security_posture_org ON public.security_posture(organization_id);
CREATE INDEX IF NOT EXISTS idx_security_scans_org ON public.security_scans(organization_id);
CREATE INDEX IF NOT EXISTS idx_findings_org ON public.findings(organization_id);

-- Update existing records to set organization_id from aws_credentials
UPDATE public.security_posture sp
SET organization_id = ac.organization_id
FROM public.aws_credentials ac
WHERE sp.aws_account_id = ac.id
AND sp.organization_id IS NULL;

UPDATE public.security_scans ss
SET organization_id = ac.organization_id
FROM public.aws_credentials ac
WHERE ss.aws_account_id = ac.id
AND ss.organization_id IS NULL;

-- Update findings only if it has aws_account_id column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'findings' 
    AND column_name = 'aws_account_id'
  ) THEN
    UPDATE public.findings f
    SET organization_id = ac.organization_id
    FROM public.aws_credentials ac
    WHERE f.aws_account_id = ac.id
    AND f.organization_id IS NULL;
  END IF;
END $$;

-- Add RLS policies for security_posture
ALTER TABLE public.security_posture ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their org security posture" ON public.security_posture;
CREATE POLICY "Users can view their org security posture"
ON public.security_posture
FOR SELECT
USING (organization_id = (SELECT public.get_user_organization(auth.uid())));

-- Add RLS policies for security_scans
ALTER TABLE public.security_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their org security scans" ON public.security_scans;
CREATE POLICY "Users can view their org security scans"
ON public.security_scans
FOR SELECT
USING (organization_id = (SELECT public.get_user_organization(auth.uid())));

-- Add RLS policies for findings
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their org findings" ON public.findings;
CREATE POLICY "Users can view their org findings"
ON public.findings
FOR SELECT
USING (organization_id = (SELECT public.get_user_organization(auth.uid())));