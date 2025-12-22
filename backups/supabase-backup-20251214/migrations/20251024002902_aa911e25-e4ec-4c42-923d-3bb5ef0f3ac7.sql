-- Fix RLS policies to include organization filtering

-- Update findings policies
DROP POLICY IF EXISTS "Allow public read access" ON public.findings;
DROP POLICY IF EXISTS "Allow public insert access" ON public.findings;
DROP POLICY IF EXISTS "Allow public update access" ON public.findings;

CREATE POLICY "Users can view findings in their organization"
  ON public.findings FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL 
    OR organization_id = public.get_user_organization(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Users can insert findings"
  ON public.findings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update findings in their organization"
  ON public.findings FOR UPDATE
  TO authenticated
  USING (
    organization_id IS NULL 
    OR organization_id = public.get_user_organization(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Update security_scans policies
DROP POLICY IF EXISTS "Allow public read access" ON public.security_scans;
DROP POLICY IF EXISTS "Allow public insert access" ON public.security_scans;
DROP POLICY IF EXISTS "Allow public update access" ON public.security_scans;

CREATE POLICY "Users can view scans in their organization"
  ON public.security_scans FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL 
    OR organization_id = public.get_user_organization(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Users can insert scans"
  ON public.security_scans FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update scans in their organization"
  ON public.security_scans FOR UPDATE
  TO authenticated
  USING (
    organization_id IS NULL 
    OR organization_id = public.get_user_organization(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Update cost_recommendations policies
DROP POLICY IF EXISTS "Allow public read access" ON public.cost_recommendations;
DROP POLICY IF EXISTS "Allow public insert access" ON public.cost_recommendations;
DROP POLICY IF EXISTS "Allow public update access" ON public.cost_recommendations;
DROP POLICY IF EXISTS "Allow public delete access" ON public.cost_recommendations;

CREATE POLICY "Users can view recommendations in their organization"
  ON public.cost_recommendations FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL 
    OR organization_id = public.get_user_organization(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Users can insert recommendations"
  ON public.cost_recommendations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update recommendations in their organization"
  ON public.cost_recommendations FOR UPDATE
  TO authenticated
  USING (
    organization_id IS NULL 
    OR organization_id = public.get_user_organization(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Users can delete recommendations in their organization"
  ON public.cost_recommendations FOR DELETE
  TO authenticated
  USING (
    organization_id IS NULL 
    OR organization_id = public.get_user_organization(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Update aws_credentials policies
DROP POLICY IF EXISTS "Allow public read access" ON public.aws_credentials;
DROP POLICY IF EXISTS "Allow public insert access" ON public.aws_credentials;
DROP POLICY IF EXISTS "Allow public update access" ON public.aws_credentials;
DROP POLICY IF EXISTS "Allow public delete access" ON public.aws_credentials;

CREATE POLICY "Users can view credentials in their organization"
  ON public.aws_credentials FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL 
    OR organization_id = public.get_user_organization(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Users can insert credentials"
  ON public.aws_credentials FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Users can update credentials in their organization"
  ON public.aws_credentials FOR UPDATE
  TO authenticated
  USING (
    organization_id IS NULL 
    OR organization_id = public.get_user_organization(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Users can delete credentials in their organization"
  ON public.aws_credentials FOR DELETE
  TO authenticated
  USING (
    organization_id IS NULL 
    OR organization_id = public.get_user_organization(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );