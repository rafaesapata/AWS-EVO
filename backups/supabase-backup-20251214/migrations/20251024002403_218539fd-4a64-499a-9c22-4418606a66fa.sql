-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'org_admin', 'org_user');

-- Create organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  settings JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Update user_roles table to include organization_id
DROP TABLE IF EXISTS public.user_roles CASCADE;
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'org_user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, organization_id)
);

-- Create impersonation tracking table
CREATE TABLE public.impersonation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id UUID REFERENCES auth.users(id) NOT NULL,
  target_organization_id UUID REFERENCES public.organizations(id) NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  ip_address TEXT
);

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Security definer function to get user's organization
CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.profiles
  WHERE id = _user_id
  LIMIT 1
$$;

-- Security definer function to check if user belongs to organization
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id AND organization_id = _org_id
  )
$$;

-- Security definer function to validate email domain
CREATE OR REPLACE FUNCTION public.is_corporate_email(_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  domain TEXT;
  free_domains TEXT[] := ARRAY[
    'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br',
    'live.com', 'icloud.com', 'aol.com', 'protonmail.com', 'mail.com',
    'gmx.com', 'yandex.com', 'zoho.com', 'tutanota.com', 'fastmail.com'
  ];
BEGIN
  domain := lower(split_part(_email, '@', 2));
  RETURN NOT (domain = ANY(free_domains));
END;
$$;

-- Function to extract domain from email
CREATE OR REPLACE FUNCTION public.extract_email_domain(_email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(split_part(_email, '@', 2))
$$;

-- Trigger function to auto-create profile and organization
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_domain TEXT;
  org_id UUID;
  is_first_user BOOLEAN;
BEGIN
  -- Extract domain from email
  user_domain := public.extract_email_domain(NEW.email);
  
  -- Validate corporate email
  IF NOT public.is_corporate_email(NEW.email) THEN
    RAISE EXCEPTION 'Only corporate email addresses are allowed. Free email providers (Gmail, Hotmail, etc.) are not permitted.';
  END IF;
  
  -- Check if organization exists
  SELECT id INTO org_id FROM public.organizations WHERE domain = user_domain;
  
  -- If organization doesn't exist, create it (first user from domain)
  IF org_id IS NULL THEN
    INSERT INTO public.organizations (name, domain)
    VALUES (
      COALESCE(NEW.raw_user_meta_data->>'company_name', initcap(user_domain)),
      user_domain
    )
    RETURNING id INTO org_id;
    
    is_first_user := true;
  ELSE
    is_first_user := false;
  END IF;
  
  -- Create profile
  INSERT INTO public.profiles (id, organization_id, full_name, email)
  VALUES (
    NEW.id,
    org_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.email
  );
  
  -- Assign role (first user becomes org_admin)
  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (
    NEW.id,
    org_id,
    CASE WHEN is_first_user THEN 'org_admin'::app_role ELSE 'org_user'::app_role END
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impersonation_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organizations
CREATE POLICY "Users can view their own organization"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (id = public.get_user_organization(auth.uid()));

CREATE POLICY "Super admins can view all organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Org admins can update their organization"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (
    id = public.get_user_organization(auth.uid()) 
    AND public.has_role(auth.uid(), 'org_admin')
  );

CREATE POLICY "Super admins can manage all organizations"
  ON public.organizations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for profiles
CREATE POLICY "Users can view profiles in their organization"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Org admins can update profiles in their organization"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND public.has_role(auth.uid(), 'org_admin')
  );

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Org admins can view roles in their organization"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND public.has_role(auth.uid(), 'org_admin')
  );

CREATE POLICY "Org admins can manage roles in their organization"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND public.has_role(auth.uid(), 'org_admin')
  );

CREATE POLICY "Super admins can manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS for impersonation_log
CREATE POLICY "Super admins can view impersonation logs"
  ON public.impersonation_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert impersonation logs"
  ON public.impersonation_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Update existing tables to include organization_id where needed
ALTER TABLE public.aws_credentials ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.security_scans ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.cost_recommendations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Create indexes for performance
CREATE INDEX idx_profiles_organization_id ON public.profiles(organization_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_organization_id ON public.user_roles(organization_id);
CREATE INDEX idx_organizations_domain ON public.organizations(domain);

-- Insert first super admin (you'll need to update the email after first login)
-- This will be done manually through the UI