-- Add organization_id to infrastructure_topology table
ALTER TABLE public.infrastructure_topology 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Populate organization_id based on aws_account_id
UPDATE public.infrastructure_topology
SET organization_id = (
  SELECT organization_id 
  FROM public.aws_credentials 
  WHERE aws_credentials.id = infrastructure_topology.aws_account_id
)
WHERE organization_id IS NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_infrastructure_topology_organization_id 
ON public.infrastructure_topology(organization_id);

-- Enable RLS on infrastructure_topology if not already enabled
ALTER TABLE public.infrastructure_topology ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view infrastructure topology in their organization" ON public.infrastructure_topology;
DROP POLICY IF EXISTS "System can insert infrastructure topology" ON public.infrastructure_topology;
DROP POLICY IF EXISTS "Users can update infrastructure topology in their organization" ON public.infrastructure_topology;

-- Create RLS policies for infrastructure_topology
CREATE POLICY "Users can view infrastructure topology in their organization"
ON public.infrastructure_topology
FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id IN (
      SELECT get_user_organization(auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
);

CREATE POLICY "System can insert infrastructure topology"
ON public.infrastructure_topology
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update infrastructure topology in their organization"
ON public.infrastructure_topology
FOR UPDATE
USING (
  organization_id IS NOT NULL AND (
    organization_id IN (
      SELECT get_user_organization(auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
);