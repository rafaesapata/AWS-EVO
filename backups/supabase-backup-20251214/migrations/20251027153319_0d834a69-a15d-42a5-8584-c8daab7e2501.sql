-- Final fix: remove recursive user_roles policies except 'view own roles'
-- Keep only minimal, safe policy to avoid recursion
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname <> 'Users can view their own roles') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Super admins can view all roles" ON public.user_roles;';
    EXECUTE 'DROP POLICY IF EXISTS "Super admins can manage all roles" ON public.user_roles;';
    EXECUTE 'DROP POLICY IF EXISTS "Org admins can view roles in org" ON public.user_roles;';
    EXECUTE 'DROP POLICY IF EXISTS "Org admins can manage roles in org" ON public.user_roles;';
  END IF;
END$$;