-- CRITICAL SECURITY FIX PART 1: Fix SECURITY DEFINER functions
-- Add SET search_path to prevent privilege escalation

-- Drop functions that need signature changes
DROP FUNCTION IF EXISTS public.soft_delete_user(uuid);
DROP FUNCTION IF EXISTS public.restore_user(uuid);

-- Recreate functions with SECURITY DEFINER and fixed search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id)
  VALUES (new.id);
  RETURN new;
END;
$$;

CREATE FUNCTION public.soft_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE auth.users
  SET deleted_at = now()
  WHERE id = _user_id;
END;
$$;

CREATE FUNCTION public.restore_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE auth.users
  SET deleted_at = NULL
  WHERE id = _user_id;
END;
$$;

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
  SELECT organization_id INTO impersonated_org_id
  FROM public.impersonation_sessions
  WHERE admin_user_id = _user_id
    AND is_active = true
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF impersonated_org_id IS NOT NULL THEN
    RETURN impersonated_org_id;
  END IF;

  SELECT organization_id INTO org_id
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1;

  RETURN org_id;
END;
$$;

-- Fix other SECURITY DEFINER functions
CREATE OR REPLACE FUNCTION public.handle_user_sign_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE profiles
  SET last_sign_in_at = now()
  WHERE user_id = new.id;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_impersonation(_admin_user_id uuid, _target_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _organization_id uuid;
  _session_id uuid;
BEGIN
  SELECT organization_id INTO _organization_id
  FROM user_roles
  WHERE user_id = _target_user_id
  LIMIT 1;

  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'Target user has no organization';
  END IF;

  INSERT INTO impersonation_sessions (admin_user_id, target_user_id, organization_id, is_active, expires_at)
  VALUES (_admin_user_id, _target_user_id, _organization_id, true, now() + interval '1 hour')
  RETURNING id INTO _session_id;

  RETURN _session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_impersonation(_admin_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE impersonation_sessions
  SET is_active = false, ended_at = now()
  WHERE admin_user_id = _admin_user_id AND is_active = true;
END;
$$;