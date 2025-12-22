-- ============================================
-- CORREÇÃO CRÍTICA: Sistema de Knowledge Base
-- (Versão 2 - sem recriar tabela favorites)
-- ============================================

-- 1. LIMPAR RLS POLICIES CONFLITANTES em knowledge_base_articles
DROP POLICY IF EXISTS "Users can view their org's knowledge base" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "Authors can update their articles" ON public.knowledge_base_articles;

-- 2. POPULAR organization_id NULL antes de tornar NOT NULL
UPDATE public.knowledge_base_articles
SET organization_id = (
  SELECT ur.organization_id 
  FROM public.user_roles ur 
  WHERE ur.user_id = knowledge_base_articles.author_id 
  LIMIT 1
)
WHERE organization_id IS NULL AND author_id IS NOT NULL;

-- Para artigos sem author_id, usar uma organização padrão ou marcar para revisão
-- (Assumindo que não deve haver artigos sem author_id)

-- 3. TORNAR organization_id NOT NULL
ALTER TABLE public.knowledge_base_articles 
  ALTER COLUMN organization_id SET NOT NULL;

-- 4. CORRIGIR FUNÇÕES COM search_path MUTÁVEL
CREATE OR REPLACE FUNCTION public.update_wizard_progress_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id 
      AND organization_id = _org_id
  );
END;
$function$;

-- 5. ADICIONAR ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_kb_articles_org_status 
  ON public.knowledge_base_articles(organization_id, approval_status);

CREATE INDEX IF NOT EXISTS idx_kb_articles_author 
  ON public.knowledge_base_articles(author_id);

CREATE INDEX IF NOT EXISTS idx_kb_articles_created 
  ON public.knowledge_base_articles(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kb_articles_search 
  ON public.knowledge_base_articles USING GIN(search_vector);

CREATE INDEX IF NOT EXISTS idx_kb_favorites_user 
  ON public.knowledge_base_favorites(user_id);

CREATE INDEX IF NOT EXISTS idx_kb_favorites_article 
  ON public.knowledge_base_favorites(article_id);

CREATE INDEX IF NOT EXISTS idx_kb_comments_article 
  ON public.knowledge_base_comments(article_id);

CREATE INDEX IF NOT EXISTS idx_kb_analytics_article_date 
  ON public.knowledge_base_analytics(article_id, created_at DESC);
