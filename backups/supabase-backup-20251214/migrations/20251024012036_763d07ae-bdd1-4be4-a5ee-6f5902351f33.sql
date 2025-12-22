-- TV Dashboard Configuration
CREATE TABLE public.tv_dashboards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  refresh_interval INTEGER DEFAULT 30, -- seconds
  access_token TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_accessed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_tv_dashboards_user ON public.tv_dashboards(user_id);
CREATE INDEX idx_tv_dashboards_token ON public.tv_dashboards(access_token);
CREATE INDEX idx_tv_dashboards_org ON public.tv_dashboards(organization_id);

ALTER TABLE public.tv_dashboards ENABLE ROW LEVEL SECURITY;

-- Users can view their own TV dashboards
CREATE POLICY "Users can view their own TV dashboards"
ON public.tv_dashboards FOR SELECT
USING (user_id = auth.uid() OR organization_id = get_user_organization(auth.uid()));

-- Users can create TV dashboards
CREATE POLICY "Users can create TV dashboards"
ON public.tv_dashboards FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can update their own TV dashboards
CREATE POLICY "Users can update their own TV dashboards"
ON public.tv_dashboards FOR UPDATE
USING (user_id = auth.uid());

-- Users can delete their own TV dashboards
CREATE POLICY "Users can delete their own TV dashboards"
ON public.tv_dashboards FOR DELETE
USING (user_id = auth.uid());

-- Add audit trigger
CREATE TRIGGER audit_tv_dashboards
  AFTER INSERT OR UPDATE OR DELETE ON public.tv_dashboards
  FOR EACH ROW EXECUTE FUNCTION public.audit_table_changes();

-- Update updated_at trigger
CREATE TRIGGER update_tv_dashboards_updated_at
  BEFORE UPDATE ON public.tv_dashboards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();