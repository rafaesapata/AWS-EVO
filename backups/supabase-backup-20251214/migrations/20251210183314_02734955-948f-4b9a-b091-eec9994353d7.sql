-- Remove conflicting RLS policies on resource_metrics
DROP POLICY IF EXISTS "Users can view metrics in their organization" ON public.resource_metrics;
DROP POLICY IF EXISTS "Users can view resource metrics in their organization only" ON public.resource_metrics;

-- Create single clear SELECT policy
CREATE POLICY "Users can view metrics in their organization" 
ON public.resource_metrics 
FOR SELECT 
USING (
  organization_id = get_user_organization(auth.uid()) 
  OR has_role(auth.uid(), 'super_admin'::app_role)
);