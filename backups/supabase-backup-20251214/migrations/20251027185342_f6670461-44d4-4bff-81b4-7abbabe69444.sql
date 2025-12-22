-- =====================================================
-- CORREÇÃO CRÍTICA DE SEGURANÇA: RLS policies para daily_costs
-- Garantir que organizações só vejam seus próprios dados via aws_credentials
-- =====================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their organization's daily costs" ON public.daily_costs;
DROP POLICY IF EXISTS "Service role can manage daily costs" ON public.daily_costs;

-- Policy: Usuários podem ver apenas custos das contas AWS da sua organização
CREATE POLICY "Users can view their organization's daily costs"
ON public.daily_costs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.aws_credentials ac
    WHERE ac.id = daily_costs.aws_account_id
    AND ac.organization_id = (
      SELECT public.get_user_organization(auth.uid())
    )
  )
);

-- Policy: Service role pode gerenciar todos os custos (para edge functions)
CREATE POLICY "Service role can manage daily costs"
ON public.daily_costs
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- RLS policies para cost_allocation_tags
-- =====================================================

DROP POLICY IF EXISTS "Users can view their organization's cost tags" ON public.cost_allocation_tags;
DROP POLICY IF EXISTS "Service role can manage cost tags" ON public.cost_allocation_tags;

CREATE POLICY "Users can view their organization's cost tags"
ON public.cost_allocation_tags
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.aws_credentials ac
    WHERE ac.id = cost_allocation_tags.aws_account_id
    AND ac.organization_id = (
      SELECT public.get_user_organization(auth.uid())
    )
  )
);

CREATE POLICY "Service role can manage cost tags"
ON public.cost_allocation_tags
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- RLS policies para cost_recommendations
-- =====================================================

DROP POLICY IF EXISTS "Users can view their organization's cost recommendations" ON public.cost_recommendations;
DROP POLICY IF EXISTS "Users can update their organization's cost recommendations" ON public.cost_recommendations;
DROP POLICY IF EXISTS "Service role can manage cost recommendations" ON public.cost_recommendations;

CREATE POLICY "Users can view their organization's cost recommendations"
ON public.cost_recommendations
FOR SELECT
USING (
  organization_id = (
    SELECT public.get_user_organization(auth.uid())
  )
);

CREATE POLICY "Users can update their organization's cost recommendations"
ON public.cost_recommendations
FOR UPDATE
USING (
  organization_id = (
    SELECT public.get_user_organization(auth.uid())
  )
)
WITH CHECK (
  organization_id = (
    SELECT public.get_user_organization(auth.uid())
  )
);

CREATE POLICY "Service role can manage cost recommendations"
ON public.cost_recommendations
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- Adicionar índices para otimizar queries
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_daily_costs_account_date 
ON public.daily_costs(aws_account_id, cost_date DESC);

CREATE INDEX IF NOT EXISTS idx_cost_allocation_tags_account 
ON public.cost_allocation_tags(aws_account_id);

CREATE INDEX IF NOT EXISTS idx_cost_recommendations_org 
ON public.cost_recommendations(organization_id);