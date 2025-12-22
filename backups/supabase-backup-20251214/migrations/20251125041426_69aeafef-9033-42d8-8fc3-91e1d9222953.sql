-- Add is_restricted column to knowledge_base_articles
ALTER TABLE public.knowledge_base_articles 
ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN DEFAULT false;

-- Create table for article permissions (who can view restricted articles)
CREATE TABLE IF NOT EXISTS public.knowledge_base_article_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES public.knowledge_base_articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  granted_by UUID NOT NULL,
  granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(article_id, user_id)
);

-- Enable RLS on article permissions
ALTER TABLE public.knowledge_base_article_permissions ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view permissions for articles they have access to
CREATE POLICY "Users can view their own permissions"
ON public.knowledge_base_article_permissions
FOR SELECT
USING (
  user_id = auth.uid() OR
  granted_by = auth.uid() OR
  has_role(auth.uid(), 'super_admin')
);

-- RLS: Article authors can manage permissions for their articles
CREATE POLICY "Authors can manage article permissions"
ON public.knowledge_base_article_permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.knowledge_base_articles kba
    WHERE kba.id = knowledge_base_article_permissions.article_id
    AND kba.author_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.knowledge_base_articles kba
    WHERE kba.id = knowledge_base_article_permissions.article_id
    AND kba.author_id = auth.uid()
  )
);

-- Update RLS policy for knowledge_base_articles to respect restricted access
DROP POLICY IF EXISTS "Users can view articles in their org" ON public.knowledge_base_articles;

CREATE POLICY "Users can view articles in their org with restrictions"
ON public.knowledge_base_articles
FOR SELECT
USING (
  (organization_id = get_user_organization(auth.uid()) OR has_role(auth.uid(), 'super_admin'))
  AND (
    -- Not restricted OR user is author OR user has explicit permission
    (is_restricted = false OR is_restricted IS NULL)
    OR author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.knowledge_base_article_permissions kbap
      WHERE kbap.article_id = knowledge_base_articles.id
      AND kbap.user_id = auth.uid()
    )
  )
);

-- Create storage bucket for article attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-base-attachments',
  'knowledge-base-attachments',
  false,
  52428800, -- 50MB limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain',
    'application/zip'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for attachments
CREATE POLICY "Users can view attachments in their org articles"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'knowledge-base-attachments'
  AND EXISTS (
    SELECT 1 FROM public.knowledge_base_attachments kba
    INNER JOIN public.knowledge_base_articles kbart ON kba.article_id = kbart.id
    WHERE kba.file_path = storage.objects.name
    AND kbart.organization_id = get_user_organization(auth.uid())
    AND (
      -- Same logic as articles: not restricted OR has permission
      (kbart.is_restricted = false OR kbart.is_restricted IS NULL)
      OR kbart.author_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.knowledge_base_article_permissions kbap
        WHERE kbap.article_id = kbart.id
        AND kbap.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Users can upload attachments to their org articles"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'knowledge-base-attachments'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete their own attachments"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'knowledge-base-attachments'
  AND EXISTS (
    SELECT 1 FROM public.knowledge_base_attachments kba
    WHERE kba.file_path = storage.objects.name
    AND kba.uploaded_by = auth.uid()
  )
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_kb_article_permissions_article_id 
ON public.knowledge_base_article_permissions(article_id);

CREATE INDEX IF NOT EXISTS idx_kb_article_permissions_user_id 
ON public.knowledge_base_article_permissions(user_id);

CREATE INDEX IF NOT EXISTS idx_kb_analytics_article_user 
ON public.knowledge_base_analytics(article_id, user_id, event_type);

-- Function to track article views with full audit
CREATE OR REPLACE FUNCTION public.track_article_view_detailed(
  p_article_id UUID,
  p_reading_time INTEGER DEFAULT NULL,
  p_scroll_depth INTEGER DEFAULT NULL,
  p_device_type TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.knowledge_base_articles
  WHERE id = p_article_id;
  
  -- Increment view count
  UPDATE public.knowledge_base_articles
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = p_article_id;
  
  -- Track in analytics for audit trail
  INSERT INTO public.knowledge_base_analytics (
    article_id,
    organization_id,
    user_id,
    event_type,
    reading_time_seconds,
    scroll_depth_percentage,
    device_type,
    created_at
  ) VALUES (
    p_article_id,
    v_org_id,
    auth.uid(),
    'view',
    p_reading_time,
    p_scroll_depth,
    p_device_type,
    now()
  );
END;
$$;