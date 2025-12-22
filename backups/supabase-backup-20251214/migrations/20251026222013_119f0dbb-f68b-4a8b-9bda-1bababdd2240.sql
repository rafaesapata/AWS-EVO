-- Fix RLS policies for ai_insights table to allow users to dismiss insights

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "System can manage insights" ON public.ai_insights;

-- Create comprehensive policies for ai_insights
CREATE POLICY "Users can update insights in their org"
ON public.ai_insights
FOR UPDATE
USING (
  (organization_id IS NULL) OR 
  (organization_id = get_user_organization(auth.uid())) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  (organization_id IS NULL) OR 
  (organization_id = get_user_organization(auth.uid())) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- Allow system/functions to insert insights
CREATE POLICY "System can insert insights"
ON public.ai_insights
FOR INSERT
WITH CHECK (true);

-- Allow users to delete insights in their org (optional, for cleanup)
CREATE POLICY "Users can delete insights in their org"
ON public.ai_insights
FOR DELETE
USING (
  (organization_id IS NULL) OR 
  (organization_id = get_user_organization(auth.uid())) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);