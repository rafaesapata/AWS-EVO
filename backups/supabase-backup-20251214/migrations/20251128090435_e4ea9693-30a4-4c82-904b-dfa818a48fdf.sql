-- Add soft delete column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON public.profiles(deleted_at);

-- Function to soft delete a user (only admins can call this)
CREATE OR REPLACE FUNCTION public.soft_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET deleted_at = now()
  WHERE id = _user_id AND deleted_at IS NULL;
END;
$$;

-- Function to restore a deleted user
CREATE OR REPLACE FUNCTION public.restore_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET deleted_at = NULL
  WHERE id = _user_id AND deleted_at IS NOT NULL;
END;
$$;

-- Function to count active (non-deleted) users in organization
CREATE OR REPLACE FUNCTION public.count_active_users(_organization_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.profiles
  WHERE organization_id = _organization_id 
    AND deleted_at IS NULL;
$$;