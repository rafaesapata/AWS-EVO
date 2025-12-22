-- CRITICAL SECURITY FIX: Remove organization_id IS NULL clause that allows credential leakage between organizations
-- Each organization MUST be completely segregated

-- Drop all existing policies on aws_credentials
DROP POLICY IF EXISTS "Users can view credentials in their organization" ON public.aws_credentials;
DROP POLICY IF EXISTS "Users can insert credentials" ON public.aws_credentials;
DROP POLICY IF EXISTS "Users can update credentials in their organization" ON public.aws_credentials;
DROP POLICY IF EXISTS "Users can delete credentials in their organization" ON public.aws_credentials;

-- Create strict RLS policies - NO NULL organization_id allowed in USING clause
CREATE POLICY "Users can view credentials in their organization only"
ON public.aws_credentials
FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can insert credentials in their organization only"
ON public.aws_credentials
FOR INSERT
WITH CHECK (
  organization_id IS NOT NULL AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can update credentials in their organization only"
ON public.aws_credentials
FOR UPDATE
USING (
  organization_id IS NOT NULL AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
)
WITH CHECK (
  organization_id IS NOT NULL AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can delete credentials in their organization only"
ON public.aws_credentials
FOR DELETE
USING (
  organization_id IS NOT NULL AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);