-- Fix security warnings: set search_path on functions without it

-- Fix increment_article_helpful
CREATE OR REPLACE FUNCTION public.increment_article_helpful(article_id UUID)
RETURNS void
SECURITY DEFINER
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.knowledge_base_articles
  SET helpful_count = COALESCE(helpful_count, 0) + 1
  WHERE id = article_id;
END;
$$;

-- Fix increment_article_views
CREATE OR REPLACE FUNCTION public.increment_article_views(article_id UUID)
RETURNS void
SECURITY DEFINER
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.knowledge_base_articles
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = article_id;
END;
$$;