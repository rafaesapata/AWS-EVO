-- Fix handle_new_user function to properly create profiles with all required fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block user creation
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to call function on user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();