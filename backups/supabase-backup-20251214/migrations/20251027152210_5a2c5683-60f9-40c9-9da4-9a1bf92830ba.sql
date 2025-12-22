-- Fix all RLS policies that use has_role for super_admin checks
-- Replace has_role(auth.uid(), 'super_admin') with direct EXISTS check to avoid circular dependencies

-- ai_insights
DROP POLICY IF EXISTS "Users can delete insights in their org" ON public.ai_insights;
DROP POLICY IF EXISTS "Users can update insights in their org" ON public.ai_insights;
DROP POLICY IF EXISTS "Users can view insights in their organization only" ON public.ai_insights;

CREATE POLICY "Users can delete insights in their org"
ON public.ai_insights FOR DELETE
USING (
  (organization_id IS NULL) OR 
  (organization_id = get_user_organization(auth.uid())) OR 
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

CREATE POLICY "Users can update insights in their org"
ON public.ai_insights FOR UPDATE
USING (
  (organization_id IS NULL) OR 
  (organization_id = get_user_organization(auth.uid())) OR 
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
)
WITH CHECK (
  (organization_id IS NULL) OR 
  (organization_id = get_user_organization(auth.uid())) OR 
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

CREATE POLICY "Users can view insights in their organization only"
ON public.ai_insights FOR SELECT
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

-- aws_credentials
DROP POLICY IF EXISTS "Users can delete credentials in their organization only" ON public.aws_credentials;
DROP POLICY IF EXISTS "Users can insert credentials in their organization only" ON public.aws_credentials;
DROP POLICY IF EXISTS "Users can update credentials in their organization only" ON public.aws_credentials;
DROP POLICY IF EXISTS "Users can view credentials in their organization only" ON public.aws_credentials;

CREATE POLICY "Users can delete credentials in their organization only"
ON public.aws_credentials FOR DELETE
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can insert credentials in their organization only"
ON public.aws_credentials FOR INSERT
WITH CHECK (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can update credentials in their organization only"
ON public.aws_credentials FOR UPDATE
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
)
WITH CHECK (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can view credentials in their organization only"
ON public.aws_credentials FOR SELECT
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

-- budget_forecasts
DROP POLICY IF EXISTS "Users can update forecasts in their organization only" ON public.budget_forecasts;
DROP POLICY IF EXISTS "Users can view forecasts in their organization only" ON public.budget_forecasts;

CREATE POLICY "Users can update forecasts in their organization only"
ON public.budget_forecasts FOR UPDATE
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can view forecasts in their organization only"
ON public.budget_forecasts FOR SELECT
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

-- cost_recommendations
DROP POLICY IF EXISTS "Users can delete recommendations in their organization only" ON public.cost_recommendations;
DROP POLICY IF EXISTS "Users can update recommendations in their organization only" ON public.cost_recommendations;
DROP POLICY IF EXISTS "Users can view recommendations in their organization only" ON public.cost_recommendations;

CREATE POLICY "Users can delete recommendations in their organization only"
ON public.cost_recommendations FOR DELETE
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can update recommendations in their organization only"
ON public.cost_recommendations FOR UPDATE
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can view recommendations in their organization only"
ON public.cost_recommendations FOR SELECT
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);