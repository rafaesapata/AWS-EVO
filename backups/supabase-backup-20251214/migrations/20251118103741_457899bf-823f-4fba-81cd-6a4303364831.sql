-- Fix remaining functions without search_path (part 2)

-- Drop and recreate fetch_all_accounts_costs with correct signature
DROP FUNCTION IF EXISTS public.fetch_all_accounts_costs();

CREATE OR REPLACE FUNCTION public.fetch_all_accounts_costs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  account RECORD;
BEGIN
  FOR account IN SELECT id FROM public.aws_credentials WHERE is_active = true
  LOOP
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/fetch-daily-costs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key')
      ),
      body := jsonb_build_object(
        'accountId', account.id,
        'days', 7
      )
    );
  END LOOP;
END;
$$;

-- Fix update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix log_audit_action
CREATE OR REPLACE FUNCTION public.log_audit_action(
  p_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.audit_log (
    user_id, 
    action, 
    resource_type, 
    resource_id, 
    details,
    organization_id
  )
  VALUES (
    p_user_id, 
    p_action, 
    p_resource_type, 
    p_resource_id, 
    p_details,
    p_organization_id
  );
END;
$$;

-- Fix has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

-- Fix user_belongs_to_org
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = _user_id AND organization_id = _org_id
  );
END;
$$;

-- Fix is_corporate_email
CREATE OR REPLACE FUNCTION public.is_corporate_email(_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
AS $$
DECLARE
  domain TEXT;
BEGIN
  domain := split_part(_email, '@', 2);
  RETURN domain NOT IN ('gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com');
END;
$$;

-- Fix extract_email_domain
CREATE OR REPLACE FUNCTION public.extract_email_domain(_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
AS $$
BEGIN
  RETURN split_part(_email, '@', 2);
END;
$$;

-- Fix update_updated_at (alias)
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix set_super_admin_by_email
CREATE OR REPLACE FUNCTION public.set_super_admin_by_email(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = _email;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', _email;
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;