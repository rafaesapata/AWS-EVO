-- Function to increment article helpful count
CREATE OR REPLACE FUNCTION public.increment_article_helpful(article_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.knowledge_base_articles
  SET helpful_count = COALESCE(helpful_count, 0) + 1
  WHERE id = article_id;
END;
$$;

-- Function to increment article view count
CREATE OR REPLACE FUNCTION public.increment_article_views(article_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.knowledge_base_articles
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = article_id;
END;
$$;