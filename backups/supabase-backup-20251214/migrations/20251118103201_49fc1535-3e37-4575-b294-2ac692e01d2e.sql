-- Create missing impersonation_sessions table
CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

-- Enable RLS
ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Only super admins can view and manage impersonation sessions
CREATE POLICY "Super admins can manage impersonation sessions"
  ON public.impersonation_sessions
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_admin 
  ON public.impersonation_sessions(admin_user_id, is_active, expires_at);

-- Fix get_user_organization to handle missing table gracefully
CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  org_id UUID;
  impersonated_org_id UUID;
BEGIN
  -- Check for active impersonation (with error handling)
  BEGIN
    SELECT organization_id INTO impersonated_org_id
    FROM public.impersonation_sessions
    WHERE admin_user_id = _user_id
      AND is_active = true
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- If impersonation_sessions doesn't exist or any error, continue
    impersonated_org_id := NULL;
  END;

  IF impersonated_org_id IS NOT NULL THEN
    RETURN impersonated_org_id;
  END IF;

  -- Get user's actual organization
  SELECT organization_id INTO org_id
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1;

  RETURN org_id;
END;
$$;