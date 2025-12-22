-- Drop the problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Users can view articles in their org with restrictions" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "kb_select" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "kb_insert" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "kb_update" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "kb_delete" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "Users can create knowledge base articles" ON public.knowledge_base_articles;
DROP POLICY IF EXISTS "Authors and admins can delete articles" ON public.knowledge_base_articles;

-- Create simplified non-recursive RLS policies
CREATE POLICY "kb_articles_select" ON public.knowledge_base_articles
FOR SELECT USING (
  (organization_id = get_user_organization(auth.uid()))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "kb_articles_insert" ON public.knowledge_base_articles
FOR INSERT WITH CHECK (
  (organization_id = get_user_organization(auth.uid()))
  AND (author_id = auth.uid())
);

CREATE POLICY "kb_articles_update" ON public.knowledge_base_articles
FOR UPDATE USING (
  (organization_id = get_user_organization(auth.uid()))
  AND (
    (author_id = auth.uid())
    OR has_role(auth.uid(), 'org_admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "kb_articles_delete" ON public.knowledge_base_articles
FOR DELETE USING (
  (organization_id = get_user_organization(auth.uid()))
  AND (
    (author_id = auth.uid())
    OR has_role(auth.uid(), 'org_admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);