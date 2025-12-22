-- Fix RLS policies for agent_actions table
DROP POLICY IF EXISTS "Users can view all agent actions" ON public.agent_actions;

CREATE POLICY "Users can view their organization's agent actions"
ON public.agent_actions
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT id FROM auth.users 
    WHERE id IN (
      SELECT user_id FROM public.user_roles 
      WHERE organization_id = get_user_organization(auth.uid())
    )
  )
);

CREATE POLICY "Users can create agent actions"
ON public.agent_actions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Fix RLS policies for alerts table
DROP POLICY IF EXISTS "Users can view all alerts" ON public.alerts;

CREATE POLICY "Users can view their organization's alerts"
ON public.alerts
FOR SELECT
TO authenticated
USING (
  alert_rule_id IN (
    SELECT id FROM public.alert_rules 
    WHERE organization_id = get_user_organization(auth.uid())
  )
);

-- Add organization_id to agent_actions for better isolation
ALTER TABLE public.agent_actions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Update existing records with organization_id
UPDATE public.agent_actions
SET organization_id = (
  SELECT organization_id FROM public.user_roles 
  WHERE user_id = agent_actions.user_id 
  LIMIT 1
)
WHERE organization_id IS NULL;

-- Create better policy for agent_actions
DROP POLICY IF EXISTS "Users can view their organization's agent actions" ON public.agent_actions;

CREATE POLICY "Users can view their organization's agent actions"
ON public.agent_actions
FOR SELECT
TO authenticated
USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Users can update their own actions"
ON public.agent_actions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_agent_actions_organization ON public.agent_actions(organization_id);
CREATE INDEX IF NOT EXISTS idx_alerts_alert_rule ON public.alerts(alert_rule_id);