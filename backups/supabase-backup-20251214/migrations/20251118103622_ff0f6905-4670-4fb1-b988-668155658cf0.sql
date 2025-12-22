-- Fix database functions to include SET search_path for security

-- Fix cleanup_expired_challenges
CREATE OR REPLACE FUNCTION public.cleanup_expired_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM public.webauthn_challenges
  WHERE expires_at < now();
END;
$$;

-- Fix calculate_endpoint_stats
CREATE OR REPLACE FUNCTION public.calculate_endpoint_stats(p_monitor_id UUID, p_date DATE)
RETURNS void
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_stats RECORD;
BEGIN
  -- Calcular estatísticas do dia
  SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE success = true) as successful,
    COUNT(*) FILTER (WHERE success = false) as failed,
    AVG(response_time_ms) as avg_time,
    MIN(response_time_ms) as min_time,
    MAX(response_time_ms) as max_time,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_time_ms) as p50,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99
  INTO v_stats
  FROM public.endpoint_monitor_results
  WHERE monitor_id = p_monitor_id
    AND DATE(checked_at) = p_date;

  -- Inserir ou atualizar estatísticas
  INSERT INTO public.endpoint_monitor_stats (
    monitor_id,
    stat_date,
    total_checks,
    successful_checks,
    failed_checks,
    avg_response_time_ms,
    min_response_time_ms,
    max_response_time_ms,
    p50_response_time_ms,
    p95_response_time_ms,
    p99_response_time_ms,
    uptime_percentage
  )
  VALUES (
    p_monitor_id,
    p_date,
    v_stats.total,
    v_stats.successful,
    v_stats.failed,
    v_stats.avg_time,
    v_stats.min_time,
    v_stats.max_time,
    v_stats.p50,
    v_stats.p95,
    v_stats.p99,
    CASE 
      WHEN v_stats.total > 0 THEN (v_stats.successful::FLOAT / v_stats.total * 100)
      ELSE 0
    END
  )
  ON CONFLICT (monitor_id, stat_date)
  DO UPDATE SET
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

-- Fix update_wizard_progress_updated_at
CREATE OR REPLACE FUNCTION update_wizard_progress_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix calculate_waste_priority_score (if exists, create with proper search_path)
CREATE OR REPLACE FUNCTION public.calculate_waste_priority_score(
  p_monthly_cost NUMERIC,
  p_age_days INTEGER,
  p_resource_type TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
AS $$
DECLARE
  v_score INTEGER := 0;
BEGIN
  -- Base score from cost (0-40 points)
  v_score := v_score + LEAST(40, (p_monthly_cost / 100)::INTEGER);
  
  -- Age score (0-30 points)
  v_score := v_score + LEAST(30, (p_age_days / 10)::INTEGER);
  
  -- Resource type multiplier (0-30 points)
  CASE p_resource_type
    WHEN 'ec2' THEN v_score := v_score + 30;
    WHEN 'rds' THEN v_score := v_score + 25;
    WHEN 'ebs' THEN v_score := v_score + 20;
    WHEN 's3' THEN v_score := v_score + 15;
    ELSE v_score := v_score + 10;
  END CASE;
  
  RETURN LEAST(100, v_score);
END;
$$;