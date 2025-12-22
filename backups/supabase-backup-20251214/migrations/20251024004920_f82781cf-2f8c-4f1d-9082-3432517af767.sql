-- Add language and timezone preferences to organizations
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS default_language text DEFAULT 'en',
ADD COLUMN IF NOT EXISTS default_timezone text DEFAULT 'UTC';

-- Add language and timezone preferences to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS language text,
ADD COLUMN IF NOT EXISTS timezone text;

-- Insert super admin role for rafael@uds.com.br
-- First we need to get the user_id from auth.users based on email
-- Since we can't query auth.users directly, we'll create a function to do this
CREATE OR REPLACE FUNCTION public.set_super_admin_by_email(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
BEGIN
  -- Get user_id from profiles table
  SELECT id, organization_id INTO v_user_id, v_org_id
  FROM public.profiles
  WHERE email = _email
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', _email;
  END IF;
  
  -- Delete existing roles for this user to avoid conflicts
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  
  -- Insert super_admin role
  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (v_user_id, v_org_id, 'super_admin'::app_role);
  
END;
$$;

-- Execute the function to set rafael@uds.com.br as super admin
SELECT public.set_super_admin_by_email('rafael@uds.com.br');