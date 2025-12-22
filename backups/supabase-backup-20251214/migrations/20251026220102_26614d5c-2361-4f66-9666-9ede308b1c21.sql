-- Tabela para metas e targets de métricas
CREATE TABLE public.dashboard_metrics_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  metric_type TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  current_value NUMERIC,
  period TEXT NOT NULL DEFAULT 'monthly',
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela para alertas contextuais do dashboard
CREATE TABLE public.dashboard_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metric_value NUMERIC,
  threshold_value NUMERIC,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  action_url TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Tabela para snapshots históricos do dashboard
CREATE TABLE public.dashboard_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  snapshot_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  metrics_data JSONB NOT NULL,
  costs_data JSONB,
  findings_data JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  name TEXT,
  description TEXT
);

-- Tabela para insights de IA
CREATE TABLE public.ai_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT,
  priority INTEGER DEFAULT 50,
  actionable BOOLEAN DEFAULT true,
  actions JSONB,
  confidence_score NUMERIC,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Tabela para filtros favoritos do dashboard
CREATE TABLE public.dashboard_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  metric_type TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dashboard_metrics_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_favorites ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view targets in their org" ON public.dashboard_metrics_targets
  FOR SELECT USING (
    organization_id IS NULL OR 
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Users can manage targets in their org" ON public.dashboard_metrics_targets
  FOR ALL USING (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Users can view alerts in their org" ON public.dashboard_alerts
  FOR SELECT USING (
    organization_id IS NULL OR 
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "System can insert alerts" ON public.dashboard_alerts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update alerts in their org" ON public.dashboard_alerts
  FOR UPDATE USING (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Users can view snapshots in their org" ON public.dashboard_snapshots
  FOR SELECT USING (
    organization_id IS NULL OR 
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Users can create snapshots" ON public.dashboard_snapshots
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Users can view insights in their org" ON public.ai_insights
  FOR SELECT USING (
    organization_id IS NULL OR 
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "System can manage insights" ON public.ai_insights
  FOR ALL WITH CHECK (true);

CREATE POLICY "Users can manage their own favorites" ON public.dashboard_favorites
  FOR ALL USING (user_id = auth.uid());

-- Triggers
CREATE TRIGGER update_dashboard_metrics_targets_updated_at
  BEFORE UPDATE ON public.dashboard_metrics_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_dashboard_alerts_org_created ON public.dashboard_alerts(organization_id, created_at DESC);
CREATE INDEX idx_dashboard_snapshots_org_date ON public.dashboard_snapshots(organization_id, snapshot_date DESC);
CREATE INDEX idx_ai_insights_org_priority ON public.ai_insights(organization_id, priority DESC, created_at DESC);
CREATE INDEX idx_dashboard_favorites_user ON public.dashboard_favorites(user_id, display_order);