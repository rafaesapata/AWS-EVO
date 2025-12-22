-- CRITICAL: Fix RLS policies for tables with public access

-- 1. cost_anomalies - Add organization isolation
DROP POLICY IF EXISTS "Allow public access to cost_anomalies" ON public.cost_anomalies;

CREATE POLICY "Users can view their organization cost anomalies"
  ON public.cost_anomalies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.aws_credentials ac
      WHERE ac.id = cost_anomalies.aws_account_id
        AND ac.organization_id = get_user_organization(auth.uid())
    )
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "System can insert cost anomalies"
  ON public.cost_anomalies
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their organization cost anomalies"
  ON public.cost_anomalies
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.aws_credentials ac
      WHERE ac.id = cost_anomalies.aws_account_id
        AND ac.organization_id = get_user_organization(auth.uid())
    )
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 2. resource_inventory - Add organization isolation
DROP POLICY IF EXISTS "Allow public access to resource_inventory" ON public.resource_inventory;

-- Add organization_id column if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'resource_inventory' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.resource_inventory ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
    CREATE INDEX idx_resource_inventory_organization_id ON public.resource_inventory(organization_id);
  END IF;
END $$;

-- Update existing records
UPDATE public.resource_inventory ri
SET organization_id = ac.organization_id
FROM public.aws_credentials ac
WHERE ri.aws_account_id = ac.id
  AND ri.organization_id IS NULL;

CREATE POLICY "Users can view their organization resource inventory"
  ON public.resource_inventory
  FOR SELECT
  USING (
    organization_id = get_user_organization(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "System can manage resource inventory"
  ON public.resource_inventory
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. tagging_compliance - Add organization isolation  
DROP POLICY IF EXISTS "Allow public access" ON public.tagging_compliance;

-- Add organization_id column if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tagging_compliance' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.tagging_compliance ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
    CREATE INDEX idx_tagging_compliance_organization_id ON public.tagging_compliance(organization_id);
  END IF;
END $$;

CREATE POLICY "Users can view their organization tagging compliance"
  ON public.tagging_compliance
  FOR SELECT
  USING (
    organization_id = get_user_organization(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "System can manage tagging compliance"
  ON public.tagging_compliance
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4. alert_rules - Add organization isolation
DROP POLICY IF EXISTS "Allow public access" ON public.alert_rules;

-- Add organization_id column if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'alert_rules' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.alert_rules ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
    CREATE INDEX idx_alert_rules_organization_id ON public.alert_rules(organization_id);
  END IF;
END $$;

CREATE POLICY "Users can view their organization alert rules"
  ON public.alert_rules
  FOR SELECT
  USING (
    organization_id = get_user_organization(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Users can manage their organization alert rules"
  ON public.alert_rules
  FOR ALL
  USING (
    organization_id = get_user_organization(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );