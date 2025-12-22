-- Update get_user_organization to support impersonation
CREATE OR REPLACE FUNCTION get_user_organization(_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
  impersonated_org_id UUID;
BEGIN
  -- First check if user is impersonating another organization
  SELECT target_organization_id INTO impersonated_org_id
  FROM impersonation_log
  WHERE super_admin_id = _user_id
    AND ended_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1;
  
  -- If impersonating, return the impersonated org
  IF impersonated_org_id IS NOT NULL THEN
    RETURN impersonated_org_id;
  END IF;
  
  -- Otherwise return user's actual organization
  SELECT organization_id INTO org_id
  FROM profiles
  WHERE id = _user_id;
  
  RETURN org_id;
END;
$$;