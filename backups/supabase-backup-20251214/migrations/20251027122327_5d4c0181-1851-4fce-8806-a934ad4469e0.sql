-- Create helper function to get user's organization
CREATE OR REPLACE FUNCTION get_user_organization(_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
BEGIN
  SELECT organization_id INTO org_id
  FROM profiles
  WHERE id = _user_id;
  
  RETURN org_id;
END;
$$;