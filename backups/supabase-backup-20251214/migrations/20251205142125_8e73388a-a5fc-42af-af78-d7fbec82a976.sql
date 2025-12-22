
-- Fix get_user_organization function to check profiles.organization_id as fallback
CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id uuid DEFAULT auth.uid())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- If no current org set, get primary organization from user_organizations
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id
    FROM user_organizations
    WHERE user_id = _user_id
    AND is_primary = true
    LIMIT 1;
  END IF;

  -- If still no org, get any organization from user_organizations
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id
    FROM user_organizations
    WHERE user_id = _user_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- CRITICAL FIX: If still no org, check profiles.organization_id as final fallback
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id
    FROM profiles
    WHERE id = _user_id;
  END IF;

  RETURN v_org_id;
END;
$function$;

-- Fix handle_new_user to properly set user_organizations and current_organization_id
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  
  -- Create profile with all required fields INCLUDING current_organization_id
  INSERT INTO public.profiles (
    id,
    organization_id,
    current_organization_id,
    full_name,
    email
  )
  VALUES (
    NEW.id,
    v_organization_id,
    v_organization_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  
  -- CRITICAL: Insert into user_organizations table
  INSERT INTO public.user_organizations (
    user_id,
    organization_id,
    is_primary,
    created_by
  )
  VALUES (
    NEW.id,
    v_organization_id,
    true,
    NEW.id
  )
  ON CONFLICT (user_id, organization_id) DO NOTHING;
  
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
$function$;

-- Fix the existing user marcos.zjunior@cardway.com.br
INSERT INTO public.user_organizations (user_id, organization_id, is_primary, created_by)
VALUES (
  '0aa50289-792f-4c58-b096-1f9c7b7f4bb6',
  '7b45a671-2ddf-42ec-8e4d-088fbe0eeaa1',
  true,
  '0aa50289-792f-4c58-b096-1f9c7b7f4bb6'
)
ON CONFLICT (user_id, organization_id) DO NOTHING;

UPDATE public.profiles
SET current_organization_id = '7b45a671-2ddf-42ec-8e4d-088fbe0eeaa1'
WHERE id = '0aa50289-792f-4c58-b096-1f9c7b7f4bb6';

-- Also fix any other users that might have the same issue (missing user_organizations)
INSERT INTO public.user_organizations (user_id, organization_id, is_primary, created_by)
SELECT 
  p.id as user_id,
  p.organization_id,
  true as is_primary,
  p.id as created_by
FROM profiles p
WHERE p.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_organizations uo 
    WHERE uo.user_id = p.id AND uo.organization_id = p.organization_id
  )
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- Also fix profiles without current_organization_id
UPDATE public.profiles p
SET current_organization_id = p.organization_id
WHERE p.organization_id IS NOT NULL
  AND p.current_organization_id IS NULL;