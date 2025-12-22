-- =====================================================
-- SECURITY FIX: Remove all "Allow public access" policies
-- and implement proper organization isolation
-- =====================================================

-- 1. FIX saved_filters - Add org isolation
ALTER TABLE public.saved_filters ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

DROP POLICY IF EXISTS "Allow public access to saved_filters" ON public.saved_filters;

CREATE POLICY "Users can manage filters in their org"
ON public.saved_filters FOR ALL
USING (
  organization_id = get_user_organization(auth.uid()) 
  OR (is_public = true AND organization_id = get_user_organization(auth.uid()))
  OR has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  OR has_role(auth.uid(), 'super_admin')
);

-- 2. FIX compliance_checks - Add org isolation via scan
ALTER TABLE public.compliance_checks ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

DROP POLICY IF EXISTS "Allow public insert" ON public.compliance_checks;
DROP POLICY IF EXISTS "Allow public read" ON public.compliance_checks;

CREATE POLICY "Service can insert compliance checks"
ON public.compliance_checks FOR INSERT
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view compliance checks in their org"
ON public.compliance_checks FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  OR has_role(auth.uid(), 'super_admin')
);

-- 3. FIX custom_dashboards - Add org isolation
ALTER TABLE public.custom_dashboards ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

DROP POLICY IF EXISTS "Allow public access to custom_dashboards" ON public.custom_dashboards;

CREATE POLICY "Users can manage dashboards in their org"
ON public.custom_dashboards FOR ALL
USING (
  (user_id = auth.uid())
  OR (is_public = true AND organization_id = get_user_organization(auth.uid()))
  OR has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'super_admin')
);

-- 4. FIX scan_history_metrics - Add org isolation
ALTER TABLE public.scan_history_metrics ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

DROP POLICY IF EXISTS "Allow public access to scan_history_metrics" ON public.scan_history_metrics;

CREATE POLICY "Service can insert scan metrics"
ON public.scan_history_metrics FOR INSERT
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view scan metrics in their org"
ON public.scan_history_metrics FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  OR EXISTS (
    SELECT 1 FROM aws_credentials ac 
    WHERE ac.id = scan_history_metrics.aws_account_id 
    AND ac.organization_id = get_user_organization(auth.uid())
  )
  OR has_role(auth.uid(), 'super_admin')
);

-- 5. FIX pdf_reports - Add org isolation
ALTER TABLE public.pdf_reports ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

DROP POLICY IF EXISTS "Allow public access" ON public.pdf_reports;

CREATE POLICY "Users can manage reports in their org"
ON public.pdf_reports FOR ALL
USING (
  generated_by = auth.uid()
  OR organization_id = get_user_organization(auth.uid())
  OR has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  OR has_role(auth.uid(), 'super_admin')
);

-- 6. FIX scheduled_scans - Add org isolation
ALTER TABLE public.scheduled_scans ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

DROP POLICY IF EXISTS "Allow public access to scheduled_scans" ON public.scheduled_scans;

CREATE POLICY "Service can manage scheduled scans"
ON public.scheduled_scans FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view scheduled scans in their org"
ON public.scheduled_scans FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  OR EXISTS (
    SELECT 1 FROM aws_credentials ac 
    WHERE ac.id = scheduled_scans.aws_account_id 
    AND ac.organization_id = get_user_organization(auth.uid())
  )
  OR has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Admins can manage scheduled scans in their org"
ON public.scheduled_scans FOR ALL
USING (
  (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'org_admin'))
  OR has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'org_admin'))
  OR has_role(auth.uid(), 'super_admin')
);

-- 7. FIX ri_sp_recommendations - Remove duplicate public policy
DROP POLICY IF EXISTS "Allow public access to ri_sp_recommendations" ON public.ri_sp_recommendations;

-- 8. FIX notifications - Remove overly permissive policy
DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;

-- 9. FIX anomaly_detections_history - Add INSERT policy for service
CREATE POLICY "Service can insert anomaly history"
ON public.anomaly_detections_history FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- 10. Update existing data to link to organizations where possible
UPDATE public.saved_filters sf
SET organization_id = (
  SELECT p.organization_id FROM profiles p WHERE p.id = sf.user_id
)
WHERE sf.organization_id IS NULL AND sf.user_id IS NOT NULL;

UPDATE public.custom_dashboards cd
SET organization_id = (
  SELECT p.organization_id FROM profiles p WHERE p.id = cd.user_id
)
WHERE cd.organization_id IS NULL AND cd.user_id IS NOT NULL;

UPDATE public.pdf_reports pr
SET organization_id = (
  SELECT p.organization_id FROM profiles p WHERE p.id = pr.generated_by
)
WHERE pr.organization_id IS NULL AND pr.generated_by IS NOT NULL;

UPDATE public.scheduled_scans ss
SET organization_id = (
  SELECT ac.organization_id FROM aws_credentials ac WHERE ac.id = ss.aws_account_id
)
WHERE ss.organization_id IS NULL AND ss.aws_account_id IS NOT NULL;

UPDATE public.scan_history_metrics shm
SET organization_id = (
  SELECT ac.organization_id FROM aws_credentials ac WHERE ac.id = shm.aws_account_id
)
WHERE shm.organization_id IS NULL AND shm.aws_account_id IS NOT NULL;

UPDATE public.compliance_checks cc
SET organization_id = (
  SELECT ss.organization_id FROM security_scans ss WHERE ss.id = cc.scan_id
)
WHERE cc.organization_id IS NULL AND cc.scan_id IS NOT NULL;