-- Tabela para armazenar métricas de recursos AWS
CREATE TABLE IF NOT EXISTS public.resource_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id UUID REFERENCES public.aws_credentials(id) ON DELETE CASCADE,
  organization_id UUID,
  resource_type TEXT NOT NULL, -- ec2, rds, elasticache, ecs, lambda, elb, etc
  resource_id TEXT NOT NULL,
  resource_name TEXT,
  region TEXT NOT NULL,
  metric_name TEXT NOT NULL, -- CPUUtilization, MemoryUtilization, NetworkIn, etc
  metric_value NUMERIC NOT NULL,
  metric_unit TEXT, -- Percent, Bytes, Count, etc
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  additional_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_resource_metrics_account ON public.resource_metrics(aws_account_id);
CREATE INDEX IF NOT EXISTS idx_resource_metrics_org ON public.resource_metrics(organization_id);
CREATE INDEX IF NOT EXISTS idx_resource_metrics_type ON public.resource_metrics(resource_type);
CREATE INDEX IF NOT EXISTS idx_resource_metrics_timestamp ON public.resource_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_resource_metrics_resource ON public.resource_metrics(resource_id, resource_type);

-- RLS Policies
ALTER TABLE public.resource_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view metrics in their organization"
  ON public.resource_metrics FOR SELECT
  USING (
    organization_id IS NULL OR 
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "System can insert metrics"
  ON public.resource_metrics FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update metrics in their organization"
  ON public.resource_metrics FOR UPDATE
  USING (
    organization_id IS NULL OR 
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Tabela para resumo de recursos disponíveis
CREATE TABLE IF NOT EXISTS public.monitored_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id UUID REFERENCES public.aws_credentials(id) ON DELETE CASCADE,
  organization_id UUID,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_name TEXT,
  region TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- active, stopped, terminated
  metadata JSONB DEFAULT '{}',
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(aws_account_id, resource_type, resource_id, region)
);

CREATE INDEX IF NOT EXISTS idx_monitored_resources_account ON public.monitored_resources(aws_account_id);
CREATE INDEX IF NOT EXISTS idx_monitored_resources_type ON public.monitored_resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_monitored_resources_status ON public.monitored_resources(status);

ALTER TABLE public.monitored_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view monitored resources in their organization"
  ON public.monitored_resources FOR SELECT
  USING (
    organization_id IS NULL OR 
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "System can manage monitored resources"
  ON public.monitored_resources FOR ALL
  WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_resource_metrics_updated_at
  BEFORE UPDATE ON public.resource_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_monitored_resources_updated_at
  BEFORE UPDATE ON public.monitored_resources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();