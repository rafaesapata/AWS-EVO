-- Knowledge Base Complete Enhancement - Fixed
-- Article relationships and hierarchy
CREATE TABLE IF NOT EXISTS public.knowledge_base_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_article_id UUID NOT NULL REFERENCES public.knowledge_base_articles(id) ON DELETE CASCADE,
  target_article_id UUID NOT NULL REFERENCES public.knowledge_base_articles(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('related', 'prerequisite', 'see_also', 'parent', 'child')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(source_article_id, target_article_id, relationship_type)
);

-- Article templates
CREATE TABLE IF NOT EXISTS public.knowledge_base_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('runbook', 'troubleshooting', 'best_practice', 'documentation', 'custom')),
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Article comments
CREATE TABLE IF NOT EXISTS public.knowledge_base_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES public.knowledge_base_articles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.knowledge_base_comments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  section_id TEXT,
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User highlights and bookmarks
CREATE TABLE IF NOT EXISTS public.knowledge_base_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES public.knowledge_base_articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  highlighted_text TEXT NOT NULL,
  section_id TEXT,
  position_start INTEGER NOT NULL,
  position_end INTEGER NOT NULL,
  note TEXT,
  color TEXT DEFAULT 'yellow',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Reading analytics
CREATE TABLE IF NOT EXISTS public.knowledge_base_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES public.knowledge_base_articles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'read_complete', 'helpful', 'unhelpful', 'share', 'export')),
  reading_time_seconds INTEGER,
  scroll_depth_percentage INTEGER,
  device_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Article categories hierarchy
CREATE TABLE IF NOT EXISTS public.knowledge_base_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  parent_category_id UUID REFERENCES public.knowledge_base_categories(id) ON DELETE CASCADE,
  icon TEXT,
  color TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, slug)
);

-- Notification preferences
CREATE TABLE IF NOT EXISTS public.knowledge_base_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('new_article', 'article_update', 'comment_reply', 'mention', 'favorite_update', 'weekly_digest')),
  is_enabled BOOLEAN DEFAULT true,
  frequency TEXT DEFAULT 'immediate' CHECK (frequency IN ('immediate', 'daily', 'weekly', 'never')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, notification_type)
);

-- Co-authors
CREATE TABLE IF NOT EXISTS public.knowledge_base_coauthors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES public.knowledge_base_articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contribution_type TEXT CHECK (contribution_type IN ('writer', 'reviewer', 'editor')),
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(article_id, user_id)
);

-- Article export history
CREATE TABLE IF NOT EXISTS public.knowledge_base_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES public.knowledge_base_articles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  exported_by UUID NOT NULL REFERENCES auth.users(id),
  export_format TEXT NOT NULL CHECK (export_format IN ('pdf', 'markdown', 'html', 'confluence', 'backup')),
  file_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add columns to articles table
ALTER TABLE public.knowledge_base_articles
ADD COLUMN IF NOT EXISTS search_vector tsvector,
ADD COLUMN IF NOT EXISTS reading_time_minutes INTEGER,
ADD COLUMN IF NOT EXISTS difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced'));

-- Enable RLS on all new tables
ALTER TABLE public.knowledge_base_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_coauthors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_exports ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Relationships
CREATE POLICY "Users can view relationships in their org"
  ON public.knowledge_base_relationships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_base_articles kba
      WHERE kba.id = source_article_id
      AND kba.organization_id = get_user_organization(auth.uid())
    )
  );

CREATE POLICY "Users can manage relationships in their org"
  ON public.knowledge_base_relationships FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_base_articles kba
      WHERE kba.id = source_article_id
      AND kba.organization_id = get_user_organization(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.knowledge_base_articles kba
      WHERE kba.id = source_article_id
      AND kba.organization_id = get_user_organization(auth.uid())
    )
  );

-- RLS Policies: Templates
CREATE POLICY "Users can view templates in their org"
  ON public.knowledge_base_templates FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()) OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can manage templates"
  ON public.knowledge_base_templates FOR ALL
  USING (
    organization_id = get_user_organization(auth.uid()) 
    AND (has_role(auth.uid(), 'org_admin') OR has_role(auth.uid(), 'super_admin'))
  )
  WITH CHECK (organization_id = get_user_organization(auth.uid()));

-- RLS Policies: Comments
CREATE POLICY "Users can view comments in their org"
  ON public.knowledge_base_comments FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()) OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can create comments in their org"
  ON public.knowledge_base_comments FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND author_id = auth.uid()
  );

CREATE POLICY "Users can update their own comments"
  ON public.knowledge_base_comments FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Users can delete their own comments"
  ON public.knowledge_base_comments FOR DELETE
  USING (author_id = auth.uid() OR has_role(auth.uid(), 'org_admin') OR has_role(auth.uid(), 'super_admin'));

-- RLS Policies: Highlights
CREATE POLICY "Users can manage their own highlights"
  ON public.knowledge_base_highlights FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS Policies: Analytics
CREATE POLICY "System can insert analytics"
  ON public.knowledge_base_analytics FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view org analytics"
  ON public.knowledge_base_analytics FOR SELECT
  USING (
    organization_id = get_user_organization(auth.uid()) 
    OR has_role(auth.uid(), 'super_admin')
  );

-- RLS Policies: Categories
CREATE POLICY "Users can view categories in their org"
  ON public.knowledge_base_categories FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()) OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can manage categories"
  ON public.knowledge_base_categories FOR ALL
  USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'org_admin') OR has_role(auth.uid(), 'super_admin'))
  )
  WITH CHECK (organization_id = get_user_organization(auth.uid()));

-- RLS Policies: Notifications
CREATE POLICY "Users can manage their own notifications"
  ON public.knowledge_base_notifications FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS Policies: Coauthors
CREATE POLICY "Users can view coauthors in their org"
  ON public.knowledge_base_coauthors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_base_articles kba
      WHERE kba.id = article_id
      AND kba.organization_id = get_user_organization(auth.uid())
    )
  );

CREATE POLICY "Article authors can manage coauthors"
  ON public.knowledge_base_coauthors FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_base_articles kba
      WHERE kba.id = article_id
      AND kba.author_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.knowledge_base_articles kba
      WHERE kba.id = article_id
      AND kba.author_id = auth.uid()
    )
  );

-- RLS Policies: Exports
CREATE POLICY "Users can view exports in their org"
  ON public.knowledge_base_exports FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()) OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can create exports in their org"
  ON public.knowledge_base_exports FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND exported_by = auth.uid()
  );

-- Indexes for performance
CREATE INDEX idx_kb_relationships_source ON public.knowledge_base_relationships(source_article_id);
CREATE INDEX idx_kb_relationships_target ON public.knowledge_base_relationships(target_article_id);
CREATE INDEX idx_kb_templates_org ON public.knowledge_base_templates(organization_id);
CREATE INDEX idx_kb_comments_article ON public.knowledge_base_comments(article_id);
CREATE INDEX idx_kb_comments_org ON public.knowledge_base_comments(organization_id);
CREATE INDEX idx_kb_comments_parent ON public.knowledge_base_comments(parent_comment_id);
CREATE INDEX idx_kb_highlights_article ON public.knowledge_base_highlights(article_id);
CREATE INDEX idx_kb_highlights_user ON public.knowledge_base_highlights(user_id);
CREATE INDEX idx_kb_analytics_article ON public.knowledge_base_analytics(article_id);
CREATE INDEX idx_kb_analytics_org ON public.knowledge_base_analytics(organization_id);
CREATE INDEX idx_kb_analytics_created ON public.knowledge_base_analytics(created_at);
CREATE INDEX idx_kb_categories_org ON public.knowledge_base_categories(organization_id);
CREATE INDEX idx_kb_categories_parent ON public.knowledge_base_categories(parent_category_id);
CREATE INDEX idx_kb_coauthors_article ON public.knowledge_base_coauthors(article_id);
CREATE INDEX idx_kb_coauthors_user ON public.knowledge_base_coauthors(user_id);
CREATE INDEX idx_kb_exports_org ON public.knowledge_base_exports(organization_id);
CREATE INDEX idx_kb_exports_article ON public.knowledge_base_exports(article_id);
CREATE INDEX idx_kb_articles_search ON public.knowledge_base_articles USING GIN(search_vector);

-- Function to update search vector
CREATE OR REPLACE FUNCTION public.update_kb_search_vector()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_kb_search_vector_trigger ON public.knowledge_base_articles;
CREATE TRIGGER update_kb_search_vector_trigger
  BEFORE INSERT OR UPDATE ON public.knowledge_base_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_kb_search_vector();

-- Function to update reading time
CREATE OR REPLACE FUNCTION public.update_reading_time()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.reading_time_minutes = CEIL(array_length(regexp_split_to_array(NEW.content, '\s+'), 1)::NUMERIC / 200);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_reading_time_trigger ON public.knowledge_base_articles;
CREATE TRIGGER update_reading_time_trigger
  BEFORE INSERT OR UPDATE ON public.knowledge_base_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reading_time();

-- Function to get related articles
CREATE OR REPLACE FUNCTION public.get_related_articles(p_article_id UUID, p_limit INTEGER DEFAULT 5)
RETURNS TABLE (
  id UUID,
  title TEXT,
  category TEXT,
  view_count INTEGER,
  helpful_count INTEGER,
  relationship_type TEXT
)
SECURITY DEFINER
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    kba.id,
    kba.title,
    kba.category,
    kba.view_count,
    kba.helpful_count,
    kbr.relationship_type
  FROM public.knowledge_base_articles kba
  JOIN public.knowledge_base_relationships kbr ON kba.id = kbr.target_article_id
  WHERE kbr.source_article_id = p_article_id
  AND kba.approval_status = 'approved'
  AND kba.organization_id = get_user_organization(auth.uid())
  ORDER BY kba.view_count DESC, kba.helpful_count DESC
  LIMIT p_limit;
END;
$$;

-- Function to get article analytics summary
CREATE OR REPLACE FUNCTION public.get_article_analytics_summary(p_article_id UUID)
RETURNS JSON
SECURITY DEFINER
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_views', COUNT(*) FILTER (WHERE event_type = 'view'),
    'completed_reads', COUNT(*) FILTER (WHERE event_type = 'read_complete'),
    'avg_reading_time', AVG(reading_time_seconds) FILTER (WHERE reading_time_seconds IS NOT NULL),
    'avg_scroll_depth', AVG(scroll_depth_percentage) FILTER (WHERE scroll_depth_percentage IS NOT NULL),
    'helpful_count', COUNT(*) FILTER (WHERE event_type = 'helpful'),
    'unhelpful_count', COUNT(*) FILTER (WHERE event_type = 'unhelpful'),
    'shares', COUNT(*) FILTER (WHERE event_type = 'share'),
    'exports', COUNT(*) FILTER (WHERE event_type = 'export')
  ) INTO result
  FROM public.knowledge_base_analytics
  WHERE article_id = p_article_id
  AND organization_id = get_user_organization(auth.uid());
  
  RETURN result;
END;
$$;

-- Function to track article view
CREATE OR REPLACE FUNCTION public.track_article_view(
  p_article_id UUID,
  p_reading_time INTEGER DEFAULT NULL,
  p_scroll_depth INTEGER DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.knowledge_base_articles
  WHERE id = p_article_id;
  
  INSERT INTO public.knowledge_base_analytics (
    article_id,
    organization_id,
    user_id,
    event_type,
    reading_time_seconds,
    scroll_depth_percentage
  ) VALUES (
    p_article_id,
    v_org_id,
    auth.uid(),
    'view',
    p_reading_time,
    p_scroll_depth
  );
END;
$$;