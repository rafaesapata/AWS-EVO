-- AUDITORIA DE SEGURANÇA COMPLETA: Corrigir todas as tabelas com vazamento de dados entre organizações
-- Remove cláusulas "organization_id IS NULL" que permitem acesso cross-organization

-- ===== DAILY_COSTS =====
DROP POLICY IF EXISTS "Users can view costs in their organization" ON public.daily_costs;
DROP POLICY IF EXISTS "Users can insert costs" ON public.daily_costs;
DROP POLICY IF EXISTS "Users can update costs in their organization" ON public.daily_costs;

CREATE POLICY "Users can view costs in their organization only"
ON public.daily_costs FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "System can insert costs"
ON public.daily_costs FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update costs in their organization only"
ON public.daily_costs FOR UPDATE
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- ===== FINDINGS =====
DROP POLICY IF EXISTS "Users can view findings in their organization" ON public.findings;
DROP POLICY IF EXISTS "Users can insert findings" ON public.findings;
DROP POLICY IF EXISTS "Users can update findings in their organization" ON public.findings;

CREATE POLICY "Users can view findings in their organization only"
ON public.findings FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "System can insert findings"
ON public.findings FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update findings in their organization only"
ON public.findings FOR UPDATE
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- ===== COST_RECOMMENDATIONS =====
DROP POLICY IF EXISTS "Users can view recommendations in their organization" ON public.cost_recommendations;
DROP POLICY IF EXISTS "Users can insert recommendations" ON public.cost_recommendations;
DROP POLICY IF EXISTS "Users can update recommendations in their organization" ON public.cost_recommendations;
DROP POLICY IF EXISTS "Users can delete recommendations in their organization" ON public.cost_recommendations;

CREATE POLICY "Users can view recommendations in their organization only"
ON public.cost_recommendations FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "System can insert recommendations"
ON public.cost_recommendations FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update recommendations in their organization only"
ON public.cost_recommendations FOR UPDATE
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can delete recommendations in their organization only"
ON public.cost_recommendations FOR DELETE
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- ===== BUDGET_FORECASTS =====
DROP POLICY IF EXISTS "Users can view forecasts in their organization" ON public.budget_forecasts;
DROP POLICY IF EXISTS "Users can insert forecasts" ON public.budget_forecasts;
DROP POLICY IF EXISTS "Users can update forecasts in their organization" ON public.budget_forecasts;

CREATE POLICY "Users can view forecasts in their organization only"
ON public.budget_forecasts FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "System can insert forecasts"
ON public.budget_forecasts FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update forecasts in their organization only"
ON public.budget_forecasts FOR UPDATE
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- ===== AI_INSIGHTS =====
DROP POLICY IF EXISTS "Users can view insights in their org" ON public.ai_insights;

CREATE POLICY "Users can view insights in their organization only"
ON public.ai_insights FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- ===== DASHBOARD_ALERTS =====
DROP POLICY IF EXISTS "Users can view alerts in their org" ON public.dashboard_alerts;

CREATE POLICY "Users can view alerts in their organization only"
ON public.dashboard_alerts FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- ===== DASHBOARD_METRICS_TARGETS =====
DROP POLICY IF EXISTS "Users can view targets in their org" ON public.dashboard_metrics_targets;

CREATE POLICY "Users can view targets in their organization only"
ON public.dashboard_metrics_targets FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- ===== DASHBOARD_SNAPSHOTS =====
DROP POLICY IF EXISTS "Users can view snapshots in their org" ON public.dashboard_snapshots;

CREATE POLICY "Users can view snapshots in their organization only"
ON public.dashboard_snapshots FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- ===== ENDPOINT_MONITORS =====
DROP POLICY IF EXISTS "Users can view monitors in their org" ON public.endpoint_monitors;

CREATE POLICY "Users can view monitors in their organization only"
ON public.endpoint_monitors FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);