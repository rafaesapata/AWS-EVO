-- Fix recursion on user_roles policies by using security definer function has_role

-- Drop problematic policies that reference user_roles inside user_roles
DROP POLICY IF EXISTS "Super admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins can manage roles in their organization" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins can view roles in their organization" ON public.user_roles;

-- Recreate safe policies
-- Users can always view their own roles (safe, no subquery)
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Super admins can view/manage all roles using security definer function (no recursion)
CREATE POLICY "Super admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Org admins can view/manage roles within their organization
CREATE POLICY "Org admins can view roles in org"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND public.has_role(auth.uid(), 'org_admin'::app_role)
);

CREATE POLICY "Org admins can manage roles in org"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND public.has_role(auth.uid(), 'org_admin'::app_role)
)
WITH CHECK (
  organization_id = public.get_user_organization(auth.uid())
  AND public.has_role(auth.uid(), 'org_admin'::app_role)
);
