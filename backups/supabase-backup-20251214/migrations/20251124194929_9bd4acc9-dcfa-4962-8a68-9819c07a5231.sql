-- Add article versioning and additional features
CREATE TABLE IF NOT EXISTS public.knowledge_base_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES public.knowledge_base_articles(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[],
  edited_by UUID REFERENCES auth.users(id),
  edited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  change_summary TEXT,
  UNIQUE(article_id, version_number)
);

-- Add article attachments
CREATE TABLE IF NOT EXISTS public.knowledge_base_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES public.knowledge_base_articles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add article favorites
CREATE TABLE IF NOT EXISTS public.knowledge_base_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES public.knowledge_base_articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(article_id, user_id)
);

-- Add article approval workflow
ALTER TABLE public.knowledge_base_articles 
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending_review', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Enable RLS
ALTER TABLE public.knowledge_base_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_favorites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for versions
CREATE POLICY "Users can view versions in their org"
  ON public.knowledge_base_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_base_articles kba
      WHERE kba.id = article_id
      AND kba.organization_id = get_user_organization(auth.uid())
    )
  );

CREATE POLICY "System can insert versions"
  ON public.knowledge_base_versions FOR INSERT
  WITH CHECK (true);

-- RLS Policies for attachments
CREATE POLICY "Users can view attachments in their org"
  ON public.knowledge_base_attachments FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()) OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can insert attachments in their org"
  ON public.knowledge_base_attachments FOR INSERT
  WITH CHECK (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Users can delete their own attachments"
  ON public.knowledge_base_attachments FOR DELETE
  USING (uploaded_by = auth.uid() OR has_role(auth.uid(), 'super_admin'));

-- RLS Policies for favorites
CREATE POLICY "Users can manage their own favorites"
  ON public.knowledge_base_favorites FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Function to create article version on update
CREATE OR REPLACE FUNCTION public.create_article_version()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only create version if content actually changed
  IF OLD.title != NEW.title OR OLD.content != NEW.content OR OLD.category != NEW.category THEN
    INSERT INTO public.knowledge_base_versions (
      article_id,
      version_number,
      title,
      content,
      category,
      tags,
      edited_by,
      edited_at
    ) VALUES (
      NEW.id,
      NEW.version,
      OLD.title,
      OLD.content,
      OLD.category,
      OLD.tags,
      auth.uid(),
      now()
    );
    
    NEW.version = NEW.version + 1;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger for versioning
DROP TRIGGER IF EXISTS article_versioning_trigger ON public.knowledge_base_articles;
CREATE TRIGGER article_versioning_trigger
  BEFORE UPDATE ON public.knowledge_base_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_article_version();

-- Update RLS for articles to include approval status
DROP POLICY IF EXISTS "Users can view articles in their organization only" ON public.knowledge_base_articles;
CREATE POLICY "Users can view articles in their organization only"
  ON public.knowledge_base_articles FOR SELECT
  USING (
    organization_id = get_user_organization(auth.uid()) 
    AND (approval_status = 'approved' OR author_id = auth.uid() OR has_role(auth.uid(), 'org_admin') OR has_role(auth.uid(), 'super_admin'))
  );

-- Allow authors and admins to update articles
DROP POLICY IF EXISTS "Users can update their own articles" ON public.knowledge_base_articles;
CREATE POLICY "Authors and admins can update articles"
  ON public.knowledge_base_articles FOR UPDATE
  USING (
    organization_id = get_user_organization(auth.uid())
    AND (author_id = auth.uid() OR has_role(auth.uid(), 'org_admin') OR has_role(auth.uid(), 'super_admin'))
  )
  WITH CHECK (
    organization_id = get_user_organization(auth.uid())
  );

-- Allow authors and admins to delete articles
CREATE POLICY "Authors and admins can delete articles"
  ON public.knowledge_base_articles FOR DELETE
  USING (
    organization_id = get_user_organization(auth.uid())
    AND (author_id = auth.uid() OR has_role(auth.uid(), 'org_admin') OR has_role(auth.uid(), 'super_admin'))
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_kb_versions_article ON public.knowledge_base_versions(article_id);
CREATE INDEX IF NOT EXISTS idx_kb_attachments_article ON public.knowledge_base_attachments(article_id);
CREATE INDEX IF NOT EXISTS idx_kb_attachments_org ON public.knowledge_base_attachments(organization_id);
CREATE INDEX IF NOT EXISTS idx_kb_favorites_user ON public.knowledge_base_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_kb_favorites_article ON public.knowledge_base_favorites(article_id);
CREATE INDEX IF NOT EXISTS idx_kb_articles_approval ON public.knowledge_base_articles(approval_status);
CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON public.knowledge_base_articles(category);