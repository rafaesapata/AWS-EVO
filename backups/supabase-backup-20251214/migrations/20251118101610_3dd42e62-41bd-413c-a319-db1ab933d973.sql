-- CRITICAL: Fix audit_log RLS policies for organization isolation

-- Drop existing insecure policy
DROP POLICY IF EXISTS "Admins can view audit log" ON public.audit_log;

-- Create proper RLS policies with organization isolation
CREATE POLICY "Users can view their organization audit log"
  ON public.audit_log
  FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM auth.users 
      WHERE id IN (
        SELECT id FROM public.profiles 
        WHERE organization_id = get_user_organization(auth.uid())
      )
    )
    OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "System can insert audit log"
  ON public.audit_log
  FOR INSERT
  WITH CHECK (true);

-- Add organization_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit_log' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.audit_log ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
    
    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_audit_log_organization_id 
      ON public.audit_log(organization_id);
  END IF;
END $$;

-- Update existing audit logs to associate with organization (best effort)
UPDATE public.audit_log al
SET organization_id = p.organization_id
FROM public.profiles p
WHERE al.user_id = p.id
  AND al.organization_id IS NULL;

-- Create improved policy using organization_id
DROP POLICY IF EXISTS "Users can view their organization audit log" ON public.audit_log;

CREATE POLICY "Users can view their organization audit log"
  ON public.audit_log
  FOR SELECT
  USING (
    organization_id = get_user_organization(auth.uid())
    OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );