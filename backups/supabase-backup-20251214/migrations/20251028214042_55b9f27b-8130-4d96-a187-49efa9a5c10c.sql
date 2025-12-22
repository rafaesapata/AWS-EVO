-- Fix waste_detection RLS policies for organization isolation
-- Drop the insecure public access policy
DROP POLICY IF EXISTS "Allow public access to waste_detection" ON public.waste_detection;

-- Create proper organization-isolated policies
CREATE POLICY "Users can view their organization waste detection"
  ON public.waste_detection
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM aws_credentials ac
      WHERE ac.id = waste_detection.aws_account_id
      AND ac.organization_id IN (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Service role can manage waste detection"
  ON public.waste_detection
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create organization index for better query performance
CREATE INDEX IF NOT EXISTS idx_waste_detection_org_account 
  ON public.waste_detection(aws_account_id, status, yearly_waste_cost DESC);