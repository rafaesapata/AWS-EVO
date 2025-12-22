-- Tabela de configuração de endpoints para monitoramento
CREATE TABLE IF NOT EXISTS public.endpoint_monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  headers JSONB DEFAULT '{}'::jsonb,
  body TEXT,
  expected_status_code INTEGER DEFAULT 200,
  expected_response_pattern TEXT,
  timeout_ms INTEGER DEFAULT 5000,
  frequency_minutes INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  alert_on_failure BOOLEAN DEFAULT true,
  alert_threshold INTEGER DEFAULT 3,
  consecutive_failures INTEGER DEFAULT 0,
  organization_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_check_at TIMESTAMP WITH TIME ZONE,
  next_check_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de resultados dos monitoramentos
CREATE TABLE IF NOT EXISTS public.endpoint_monitor_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID NOT NULL REFERENCES public.endpoint_monitors(id) ON DELETE CASCADE,
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  response_time_ms INTEGER NOT NULL,
  status_code INTEGER,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  response_body TEXT,
  response_headers JSONB,
  dns_time_ms INTEGER,
  tcp_time_ms INTEGER,
  tls_time_ms INTEGER,
  ttfb_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de estatísticas agregadas (para performance)
CREATE TABLE IF NOT EXISTS public.endpoint_monitor_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID NOT NULL REFERENCES public.endpoint_monitors(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  total_checks INTEGER DEFAULT 0,
  successful_checks INTEGER DEFAULT 0,
  failed_checks INTEGER DEFAULT 0,
  avg_response_time_ms NUMERIC,
  min_response_time_ms INTEGER,
  max_response_time_ms INTEGER,
  p50_response_time_ms INTEGER,
  p95_response_time_ms INTEGER,
  p99_response_time_ms INTEGER,
  uptime_percentage NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(monitor_id, stat_date)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_endpoint_monitors_org ON public.endpoint_monitors(organization_id);
CREATE INDEX IF NOT EXISTS idx_endpoint_monitors_active ON public.endpoint_monitors(is_active, next_check_at);
CREATE INDEX IF NOT EXISTS idx_monitor_results_monitor ON public.endpoint_monitor_results(monitor_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_results_checked_at ON public.endpoint_monitor_results(checked_at);
CREATE INDEX IF NOT EXISTS idx_monitor_stats_monitor_date ON public.endpoint_monitor_stats(monitor_id, stat_date DESC);

-- RLS Policies
ALTER TABLE public.endpoint_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_monitor_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_monitor_stats ENABLE ROW LEVEL SECURITY;

-- Policy para endpoint_monitors
CREATE POLICY "Users can view monitors in their org"
  ON public.endpoint_monitors FOR SELECT
  USING (
    organization_id IS NULL 
    OR organization_id = get_user_organization(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Users can create monitors"
  ON public.endpoint_monitors FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Users can update monitors in their org"
  ON public.endpoint_monitors FOR UPDATE
  USING (
    organization_id = get_user_organization(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Users can delete monitors in their org"
  ON public.endpoint_monitors FOR DELETE
  USING (
    organization_id = get_user_organization(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Policy para endpoint_monitor_results
CREATE POLICY "Users can view results from their org monitors"
  ON public.endpoint_monitor_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.endpoint_monitors
      WHERE id = monitor_id 
      AND (
        organization_id IS NULL
        OR organization_id = get_user_organization(auth.uid())
        OR has_role(auth.uid(), 'super_admin'::app_role)
      )
    )
  );

CREATE POLICY "System can insert results"
  ON public.endpoint_monitor_results FOR INSERT
  WITH CHECK (true);

-- Policy para endpoint_monitor_stats
CREATE POLICY "Users can view stats from their org monitors"
  ON public.endpoint_monitor_stats FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.endpoint_monitors
      WHERE id = monitor_id 
      AND (
        organization_id IS NULL
        OR organization_id = get_user_organization(auth.uid())
        OR has_role(auth.uid(), 'super_admin'::app_role)
      )
    )
  );

CREATE POLICY "System can insert/update stats"
  ON public.endpoint_monitor_stats FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_endpoint_monitors_updated_at
  BEFORE UPDATE ON public.endpoint_monitors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_endpoint_monitor_stats_updated_at
  BEFORE UPDATE ON public.endpoint_monitor_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Função para calcular estatísticas diárias
CREATE OR REPLACE FUNCTION public.calculate_endpoint_stats(p_monitor_id UUID, p_date DATE)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_stats RECORD;
BEGIN
  -- Calcular estatísticas do dia
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed,
    AVG(response_time_ms) as avg_time,
    MIN(response_time_ms) as min_time,
    MAX(response_time_ms) as max_time,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_time_ms) as p50,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99
  INTO v_stats
  FROM public.endpoint_monitor_results
  WHERE monitor_id = p_monitor_id
    AND checked_at::date = p_date;

  -- Inserir ou atualizar estatísticas
  INSERT INTO public.endpoint_monitor_stats (
    monitor_id, stat_date,
    total_checks, successful_checks, failed_checks,
    avg_response_time_ms, min_response_time_ms, max_response_time_ms,
    p50_response_time_ms, p95_response_time_ms, p99_response_time_ms,
    uptime_percentage
  ) VALUES (
    p_monitor_id, p_date,
    v_stats.total, v_stats.successful, v_stats.failed,
    v_stats.avg_time, v_stats.min_time, v_stats.max_time,
    v_stats.p50, v_stats.p95, v_stats.p99,
    CASE WHEN v_stats.total > 0 
      THEN (v_stats.successful::numeric / v_stats.total * 100)
      ELSE 0 
    END
  )
  ON CONFLICT (monitor_id, stat_date) DO UPDATE SET
    total_checks = EXCLUDED.total_checks,
    successful_checks = EXCLUDED.successful_checks,
    failed_checks = EXCLUDED.failed_checks,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    min_response_time_ms = EXCLUDED.min_response_time_ms,
    max_response_time_ms = EXCLUDED.max_response_time_ms,
    p50_response_time_ms = EXCLUDED.p50_response_time_ms,
    p95_response_time_ms = EXCLUDED.p95_response_time_ms,
    p99_response_time_ms = EXCLUDED.p99_response_time_ms,
    uptime_percentage = EXCLUDED.uptime_percentage,
    updated_at = now();
END;
$$;