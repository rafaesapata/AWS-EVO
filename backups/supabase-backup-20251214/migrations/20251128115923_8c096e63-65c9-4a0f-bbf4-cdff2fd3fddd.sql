-- Fix handle_new_user to also create user_roles entry
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_organization_id uuid;
  v_company_domain text;
  v_organization_name text;
BEGIN
  -- Extract company domain from email
  v_company_domain := split_part(NEW.email, '@', 2);
  v_organization_name := COALESCE(NEW.raw_user_meta_data->>'company_name', v_company_domain);
  
  -- Try to find existing organization by domain
  SELECT id INTO v_organization_id
  FROM organizations
  WHERE domain = v_company_domain
  LIMIT 1;
  
  -- If no organization exists, create one
  IF v_organization_id IS NULL THEN
    INSERT INTO organizations (name, domain)
    VALUES (v_organization_name, v_company_domain)
    RETURNING id INTO v_organization_id;
  END IF;
  
  -- Create profile with all required fields
  INSERT INTO public.profiles (
    id,
    organization_id,
    full_name,
    email
  )
  VALUES (
    NEW.id,
    v_organization_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  
  -- Create user_roles entry as org_admin (first user of organization becomes admin)
  INSERT INTO public.user_roles (
    user_id,
    organization_id,
    role
  )
  VALUES (
    NEW.id,
    v_organization_id,
    'org_admin'
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block user creation
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Fix existing users that don't have user_roles entries
INSERT INTO public.user_roles (user_id, organization_id, role)
SELECT 
  p.id,
  p.organization_id,
  'org_admin'
FROM profiles p
WHERE p.organization_id IS NOT NULL
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id
  );