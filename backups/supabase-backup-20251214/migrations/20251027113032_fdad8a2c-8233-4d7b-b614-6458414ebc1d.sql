-- CRÍTICO: Adicionar organization_id à tabela remediation_tickets e criar RLS policies

-- 1. Adicionar coluna organization_id
ALTER TABLE public.remediation_tickets 
ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

-- 2. Preencher organization_id baseado nos findings/recommendations relacionados
UPDATE public.remediation_tickets rt
SET organization_id = (
  SELECT COALESCE(
    (SELECT organization_id FROM public.findings f WHERE f.id = rt.finding_id LIMIT 1),
    (SELECT organization_id FROM public.cost_recommendations cr WHERE cr.id = rt.cost_recommendation_id LIMIT 1),
    (SELECT id FROM public.organizations WHERE is_active = true ORDER BY created_at ASC LIMIT 1)
  )
)
WHERE organization_id IS NULL;

-- 3. Tornar organization_id obrigatório
ALTER TABLE public.remediation_tickets 
ALTER COLUMN organization_id SET NOT NULL;

-- 4. Criar índice para performance
CREATE INDEX idx_remediation_tickets_organization_id 
ON public.remediation_tickets(organization_id);

-- 5. Habilitar RLS
ALTER TABLE public.remediation_tickets ENABLE ROW LEVEL SECURITY;

-- 6. Drop políticas antigas se existirem
DROP POLICY IF EXISTS "Users can view tickets in their org" ON public.remediation_tickets;
DROP POLICY IF EXISTS "Users can create tickets in their org" ON public.remediation_tickets;
DROP POLICY IF EXISTS "Users can update tickets in their org" ON public.remediation_tickets;
DROP POLICY IF EXISTS "Users can delete tickets in their org" ON public.remediation_tickets;

-- 7. Criar políticas RLS seguras
CREATE POLICY "Users can view tickets in their organization only"
ON public.remediation_tickets FOR SELECT
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can create tickets in their organization only"
ON public.remediation_tickets FOR INSERT
WITH CHECK (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can update tickets in their organization only"
ON public.remediation_tickets FOR UPDATE
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
)
WITH CHECK (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can delete tickets in their organization only"
ON public.remediation_tickets FOR DELETE
USING (
  organization_id IS NOT NULL AND (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);