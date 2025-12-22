-- Add organization_id column to waf_validations table
ALTER TABLE public.waf_validations 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_waf_validations_organization_id 
ON public.waf_validations(organization_id);

-- Enable RLS on waf_validations
ALTER TABLE public.waf_validations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view waf validations in their organization" ON public.waf_validations;
DROP POLICY IF EXISTS "System can insert waf validations" ON public.waf_validations;
DROP POLICY IF EXISTS "Users can update waf validations in their organization" ON public.waf_validations;

-- Create RLS policies
CREATE POLICY "Users can view waf validations in their organization"
ON public.waf_validations
FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
);

CREATE POLICY "System can insert waf validations"
ON public.waf_validations
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update waf validations in their organization"
ON public.waf_validations
FOR UPDATE
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
);