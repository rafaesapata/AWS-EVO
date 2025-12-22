-- ==============================================
-- CORREÇÕES FINAIS - RLS e Performance (SIMPLIFICADO)
-- ==============================================

-- 1. LIMPAR RLS POLICIES CONFLITANTES da Wiki
DROP POLICY IF EXISTS "Users can view their org's knowledge base" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "Authors can update their articles" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "Authors and admins can update articles" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "Admins can delete articles" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "kb_articles_select_policy" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "kb_articles_insert_policy" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "kb_articles_update_policy" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "kb_articles_delete_policy" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "Users can view articles in their organization only" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "kb_articles_select" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "kb_articles_insert" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "kb_articles_update" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "kb_articles_delete" ON public.knowledge_base_articles;

-- Criar políticas simplificadas (usando org_admin ao invés de admin)
CREATE POLICY "kb_select"
  ON public.knowledge_base_articles
  FOR SELECT
  USING (
    organization_id = get_user_organization(auth.uid()) AND
    (approval_status = 'approved' OR author_id = auth.uid() OR 
     EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('org_admin', 'super_admin')))
  );

CREATE POLICY "kb_insert"
  ON public.knowledge_base_articles
  FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization(auth.uid()) AND
    author_id = auth.uid()
  );

CREATE POLICY "kb_update"
  ON public.knowledge_base_articles
  FOR UPDATE
  USING (
    organization_id = get_user_organization(auth.uid()) AND
    (author_id = auth.uid() OR 
     EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('org_admin', 'super_admin')))
  );

CREATE POLICY "kb_delete"
  ON public.knowledge_base_articles
  FOR DELETE
  USING (
    organization_id = get_user_organization(auth.uid()) AND
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('org_admin', 'super_admin'))
  );

-- 2. LIMPAR RLS em favorites
DROP POLICY IF EXISTS "Users can view their own favorites" ON public.knowledge_base_favorites;
DROP POLICY IF EXISTS "Users can create their own favorites" ON public.knowledge_base_favorites;
DROP POLICY IF EXISTS "Users can delete their own favorites" ON public.knowledge_base_favorites;
DROP POLICY IF EXISTS "favorites_select" ON public.knowledge_base_favorites;
DROP POLICY IF EXISTS "favorites_insert" ON public.knowledge_base_favorites;
DROP POLICY IF EXISTS "favorites_delete" ON public.knowledge_base_favorites;

CREATE POLICY "fav_select"
  ON public.knowledge_base_favorites
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "fav_insert"
  ON public.knowledge_base_favorites
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "fav_delete"
  ON public.knowledge_base_favorites
  FOR DELETE
  USING (user_id = auth.uid());

-- 3. ADICIONAR ÍNDICES DE PERFORMANCE (apenas essenciais)
CREATE INDEX IF NOT EXISTS idx_kb_articles_org_status 
  ON public.knowledge_base_articles(organization_id, approval_status);

CREATE INDEX IF NOT EXISTS idx_kb_articles_author 
  ON public.knowledge_base_articles(author_id);

CREATE INDEX IF NOT EXISTS idx_kb_articles_search 
  ON public.knowledge_base_articles USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_kb_favorites_user 
  ON public.knowledge_base_favorites(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_org 
  ON public.audit_log(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_endpoint_monitors_org 
  ON public.endpoint_monitors(organization_id);

-- 4. ATUALIZAR FUNÇÕES COM search_path CORRETO
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id 
      AND organization_id = _org_id
  );
END;
$function$;