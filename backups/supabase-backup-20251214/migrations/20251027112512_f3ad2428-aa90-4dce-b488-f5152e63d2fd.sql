-- CORREÇÃO COMPLETA DE SEGURANÇA: Adicionar verificação organization_id IS NOT NULL em TODAS as tabelas

-- ===== SECURITY_SCANS =====
DROP POLICY IF EXISTS "Users can view scans in their org" ON public.security_scans;
DROP POLICY IF EXISTS "Users can insert scans" ON public.security_scans;
DROP POLICY IF EXISTS "Users can update scans in their org" ON public.security_scans;

CREATE POLICY "Users can view scans in their organization only"
ON public.security_scans FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "System can insert scans"
ON public.security_scans FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update scans in their organization only"
ON public.security_scans FOR UPDATE
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- ===== MONITORED_RESOURCES =====
DROP POLICY IF EXISTS "Users can view monitored resources in their org" ON public.monitored_resources;
DROP POLICY IF EXISTS "Users can insert monitored resources" ON public.monitored_resources;
DROP POLICY IF EXISTS "Users can update monitored resources in their org" ON public.monitored_resources;
DROP POLICY IF EXISTS "Users can delete monitored resources in their org" ON public.monitored_resources;

CREATE POLICY "Users can view monitored resources in their organization only"
ON public.monitored_resources FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "System can insert monitored resources"
ON public.monitored_resources FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update monitored resources in their organization only"
ON public.monitored_resources FOR UPDATE
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can delete monitored resources in their organization only"
ON public.monitored_resources FOR DELETE
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- ===== RESOURCE_METRICS =====
DROP POLICY IF EXISTS "Users can view resource metrics in their org" ON public.resource_metrics;
DROP POLICY IF EXISTS "Users can insert resource metrics" ON public.resource_metrics;

CREATE POLICY "Users can view resource metrics in their organization only"
ON public.resource_metrics FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "System can insert resource metrics"
ON public.resource_metrics FOR INSERT
WITH CHECK (true);

-- ===== SCHEDULED_JOBS =====
DROP POLICY IF EXISTS "Users can view scheduled jobs in their org" ON public.scheduled_jobs;
DROP POLICY IF EXISTS "Users can manage scheduled jobs in their org" ON public.scheduled_jobs;

CREATE POLICY "Users can view scheduled jobs in their organization only"
ON public.scheduled_jobs FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can manage scheduled jobs in their organization only"
ON public.scheduled_jobs FOR ALL
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
)
WITH CHECK (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- ===== TV_DASHBOARDS =====
DROP POLICY IF EXISTS "Users can view TV dashboards in their org" ON public.tv_dashboards;
DROP POLICY IF EXISTS "Users can manage TV dashboards in their org" ON public.tv_dashboards;

CREATE POLICY "Users can view TV dashboards in their organization only"
ON public.tv_dashboards FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can manage TV dashboards in their organization only"
ON public.tv_dashboards FOR ALL
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
)
WITH CHECK (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- ===== WASTE_NOTIFICATION_SETTINGS =====
DROP POLICY IF EXISTS "Users can view waste settings in their org" ON public.waste_notification_settings;
DROP POLICY IF EXISTS "Users can manage waste settings in their org" ON public.waste_notification_settings;

CREATE POLICY "Users can view waste settings in their organization only"
ON public.waste_notification_settings FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can manage waste settings in their organization only"
ON public.waste_notification_settings FOR ALL
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
)
WITH CHECK (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);