-- Create user_organizations table for many-to-many relationship
CREATE TABLE IF NOT EXISTS public.user_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, organization_id)
);

-- Enable RLS
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own organizations"
  ON public.user_organizations
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Super admins can manage all user organizations"
  ON public.user_organizations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- Create indexes for performance
CREATE INDEX idx_user_organizations_user_id ON public.user_organizations(user_id);
CREATE INDEX idx_user_organizations_organization_id ON public.user_organizations(organization_id);

-- Add current_organization_id to profiles for tracking active organization
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS current_organization_id UUID REFERENCES public.organizations(id);

-- Migrate existing data: create user_organizations entries for all existing profiles
INSERT INTO public.user_organizations (user_id, organization_id, is_primary, created_at)
SELECT id, organization_id, true, created_at
FROM public.profiles
WHERE organization_id IS NOT NULL
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- Update current_organization_id to match organization_id
UPDATE public.profiles
SET current_organization_id = organization_id
WHERE organization_id IS NOT NULL AND current_organization_id IS NULL;

-- Create or replace function to get user's current organization
CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id UUID DEFAULT auth.uid())
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_impersonated_org UUID;
BEGIN
  -- Check for impersonation session first
  SELECT organization_id INTO v_impersonated_org
  FROM impersonation_sessions
  WHERE admin_user_id = _user_id
    AND is_active = true
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_impersonated_org IS NOT NULL THEN
    RETURN v_impersonated_org;
  END IF;

  -- Get user's current active organization
  SELECT current_organization_id INTO v_org_id
  FROM profiles
  WHERE id = _user_id;

  -- If no current org set, get primary organization
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id
    FROM user_organizations
    WHERE user_id = _user_id
    AND is_primary = true
    LIMIT 1;
  END IF;

  -- If still no org, get any organization the user belongs to
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id
    FROM user_organizations
    WHERE user_id = _user_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  RETURN v_org_id;
END;
$$;

-- Function to switch user's active organization
CREATE OR REPLACE FUNCTION public.switch_organization(_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_has_access BOOLEAN;
BEGIN
  -- Check if user has access to this organization
  SELECT EXISTS(
    SELECT 1 FROM user_organizations
    WHERE user_id = v_user_id
    AND organization_id = _organization_id
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'User does not have access to this organization';
  END IF;

  -- Update current organization
  UPDATE profiles
  SET current_organization_id = _organization_id,
      updated_at = now()
  WHERE id = v_user_id;

  RETURN true;
END;
$$;

-- Function to add user to organization (for super admins)
CREATE OR REPLACE FUNCTION public.add_user_to_organization(
  _user_id UUID,
  _organization_id UUID,
  _is_primary BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is super admin
  IF NOT EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Only super admins can add users to organizations';
  END IF;

  -- Insert user_organization
  INSERT INTO user_organizations (user_id, organization_id, is_primary, created_by)
  VALUES (_user_id, _organization_id, _is_primary, auth.uid())
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  -- If primary, update current organization
  IF _is_primary THEN
    UPDATE profiles
    SET current_organization_id = _organization_id
    WHERE id = _user_id;
  END IF;

  RETURN true;
END;
$$;

-- Function to remove user from organization (for super admins)
CREATE OR REPLACE FUNCTION public.remove_user_from_organization(
  _user_id UUID,
  _organization_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is super admin
  IF NOT EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Only super admins can remove users from organizations';
  END IF;

  -- Delete user_organization
  DELETE FROM user_organizations
  WHERE user_id = _user_id
  AND organization_id = _organization_id;

  -- If this was the current organization, switch to another
  UPDATE profiles
  SET current_organization_id = (
    SELECT organization_id FROM user_organizations
    WHERE user_id = _user_id
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1
  )
  WHERE id = _user_id
  AND current_organization_id = _organization_id;

  RETURN true;
END;
$$;