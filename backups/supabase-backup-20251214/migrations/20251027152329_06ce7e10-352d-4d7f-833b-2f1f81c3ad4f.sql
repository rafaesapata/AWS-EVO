-- Continue fixing RLS policies - Part 3

-- iam_findings
DROP POLICY IF EXISTS "System can insert IAM findings" ON public.iam_findings;
DROP POLICY IF EXISTS "Users can update IAM findings in their organization only" ON public.iam_findings;
DROP POLICY IF EXISTS "Users can view IAM findings in their organization only" ON public.iam_findings;

CREATE POLICY "System can insert IAM findings"
ON public.iam_findings FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update IAM findings in their organization only"
ON public.iam_findings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM security_scans ss
    WHERE ss.id = iam_findings.scan_id
    AND (
      ss.organization_id = get_user_organization(auth.uid()) OR
      EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
    )
  )
);

CREATE POLICY "Users can view IAM findings in their organization only"
ON public.iam_findings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM security_scans ss
    WHERE ss.id = iam_findings.scan_id
    AND (
      ss.organization_id = get_user_organization(auth.uid()) OR
      EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
    )
  )
);

-- impersonation_log
DROP POLICY IF EXISTS "Super admins can view impersonation log" ON public.impersonation_log;
DROP POLICY IF EXISTS "System can insert impersonation log" ON public.impersonation_log;

CREATE POLICY "Super admins can view impersonation log"
ON public.impersonation_log FOR SELECT
USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

CREATE POLICY "System can insert impersonation log"
ON public.impersonation_log FOR ALL
USING (true)
WITH CHECK (true);

-- monitored_resources
DROP POLICY IF EXISTS "Users can delete resources in their organization only" ON public.monitored_resources;
DROP POLICY IF EXISTS "Users can insert resources in their organization only" ON public.monitored_resources;
DROP POLICY IF EXISTS "Users can update resources in their organization only" ON public.monitored_resources;
DROP POLICY IF EXISTS "Users can view resources in their organization only" ON public.monitored_resources;

CREATE POLICY "Users can delete resources in their organization only"
ON public.monitored_resources FOR DELETE
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can insert resources in their organization only"
ON public.monitored_resources FOR INSERT
WITH CHECK (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can update resources in their organization only"
ON public.monitored_resources FOR UPDATE
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

CREATE POLICY "Users can view resources in their organization only"
ON public.monitored_resources FOR SELECT
USING (
  (organization_id IS NOT NULL) AND (
    (organization_id = get_user_organization(auth.uid())) OR
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
  )
);

-- notifications
DROP POLICY IF EXISTS "Users can update notifications in their organization only" ON public.notifications;
DROP POLICY IF EXISTS "Users can view notifications in their organization only" ON public.notifications;

CREATE POLICY "Users can update notifications in their organization only"
ON public.notifications FOR UPDATE
USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

CREATE POLICY "Users can view notifications in their organization only"
ON public.notifications FOR SELECT
USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

-- organizations
DROP POLICY IF EXISTS "Org admins can update their organization" ON public.organizations;

CREATE POLICY "Org admins can update their organization"
ON public.organizations FOR UPDATE
USING (
  (id = get_user_organization(auth.uid())) AND
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'org_admin'::app_role)
);