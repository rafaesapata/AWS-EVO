-- Continue fixing RLS policies - Part 2

-- daily_costs
DROP POLICY IF EXISTS "Users can update costs in their organization only" ON public.daily_costs;
DROP POLICY IF EXISTS "Users can view costs in their organization only" ON public.daily_costs;

CREATE POLICY "Users can update costs in their organization only"
ON public.daily_costs FOR UPDATE
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can view costs in their organization only"
ON public.daily_costs FOR SELECT
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

-- dashboard_alerts
DROP POLICY IF EXISTS "Users can update alerts in their org" ON public.dashboard_alerts;
DROP POLICY IF EXISTS "Users can view alerts in their organization only" ON public.dashboard_alerts;

CREATE POLICY "Users can update alerts in their org"
ON public.dashboard_alerts FOR UPDATE
USING (
  (organization_id = get_user_organization(auth.uid())) OR 
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

CREATE POLICY "Users can view alerts in their organization only"
ON public.dashboard_alerts FOR SELECT
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

-- dashboard_metrics_targets
DROP POLICY IF EXISTS "Users can manage targets in their org" ON public.dashboard_metrics_targets;
DROP POLICY IF EXISTS "Users can view targets in their organization only" ON public.dashboard_metrics_targets;

CREATE POLICY "Users can manage targets in their org"
ON public.dashboard_metrics_targets FOR ALL
USING (
  (organization_id = get_user_organization(auth.uid())) OR 
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

CREATE POLICY "Users can view targets in their organization only"
ON public.dashboard_metrics_targets FOR SELECT
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

-- dashboard_snapshots
DROP POLICY IF EXISTS "Users can create snapshots" ON public.dashboard_snapshots;
DROP POLICY IF EXISTS "Users can view snapshots in their organization only" ON public.dashboard_snapshots;

CREATE POLICY "Users can create snapshots"
ON public.dashboard_snapshots FOR INSERT
WITH CHECK (
  (organization_id = get_user_organization(auth.uid())) OR 
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

CREATE POLICY "Users can view snapshots in their organization only"
ON public.dashboard_snapshots FOR SELECT
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

-- endpoint_monitors
DROP POLICY IF EXISTS "Users can create monitors" ON public.endpoint_monitors;
DROP POLICY IF EXISTS "Users can delete monitors in their org" ON public.endpoint_monitors;
DROP POLICY IF EXISTS "Users can update monitors in their org" ON public.endpoint_monitors;
DROP POLICY IF EXISTS "Users can view monitors in their organization only" ON public.endpoint_monitors;

CREATE POLICY "Users can create monitors"
ON public.endpoint_monitors FOR INSERT
WITH CHECK (
  (organization_id = get_user_organization(auth.uid())) OR 
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

CREATE POLICY "Users can delete monitors in their org"
ON public.endpoint_monitors FOR DELETE
USING (
  (organization_id = get_user_organization(auth.uid())) OR 
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

CREATE POLICY "Users can update monitors in their org"
ON public.endpoint_monitors FOR UPDATE
USING (
  (organization_id = get_user_organization(auth.uid())) OR 
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

CREATE POLICY "Users can view monitors in their organization only"
ON public.endpoint_monitors FOR SELECT
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

-- findings
DROP POLICY IF EXISTS "Users can update findings in their organization only" ON public.findings;
DROP POLICY IF EXISTS "Users can view findings in their organization only" ON public.findings;

CREATE POLICY "Users can update findings in their organization only"
ON public.findings FOR UPDATE
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can view findings in their organization only"
ON public.findings FOR SELECT
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR 
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);