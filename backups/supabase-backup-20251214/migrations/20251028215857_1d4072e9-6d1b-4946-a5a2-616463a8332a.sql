-- Fix predictive_incidents RLS policies for organization isolation

-- Drop any insecure public access policies
DROP POLICY IF EXISTS "Allow public access to predictive_incidents" ON public.predictive_incidents;
DROP POLICY IF EXISTS "Allow public access to predictive_incidents_history" ON public.predictive_incidents_history;

-- Create proper organization-isolated policies for predictive_incidents
CREATE POLICY "Users can view their organization predictive incidents"
  ON public.predictive_incidents
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage predictive incidents"
  ON public.predictive_incidents
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create proper organization-isolated policies for predictive_incidents_history
CREATE POLICY "Users can view their organization predictive incidents history"
  ON public.predictive_incidents_history
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage predictive incidents history"
  ON public.predictive_incidents_history
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_predictive_incidents_org 
  ON public.predictive_incidents(organization_id, probability DESC);

CREATE INDEX IF NOT EXISTS idx_predictive_incidents_history_org 
  ON public.predictive_incidents_history(organization_id, scan_date DESC);