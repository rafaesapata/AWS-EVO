-- Fix sync_cron_jobs function
CREATE OR REPLACE FUNCTION public.sync_cron_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job RECORD;
  job_id BIGINT;
BEGIN
  -- Remove all existing cron jobs managed by this system
  PERFORM cron.unschedule(jobname) 
  FROM cron.job 
  WHERE jobname LIKE 'evo_%';
  
  -- Create cron jobs from scheduled_jobs table
  FOR job IN 
    SELECT * FROM public.scheduled_jobs WHERE is_active = true
  LOOP
    SELECT cron.schedule(
      'evo_' || job.id::text,
      job.schedule,
      format(
        'SELECT net.http_post(
          url:=%L,
          headers:=%L::jsonb,
          body:=%L::jsonb
        ) as request_id;',
        'https://bsluqzxeexanydqvmbrh.supabase.co/functions/v1/' || job.function_name,
        '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzbHVxenhlZXhhbnlkcXZtYnJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNDUzODksImV4cCI6MjA3NjgyMTM4OX0.SJBE0YCcdFagIJHJArVwGk6mV9x6r3Yocdc3ySxpO5A"}',
        job.payload::text
      )
    ) INTO job_id;
    
    -- Update last run info
    UPDATE public.scheduled_jobs
    SET updated_at = now()
    WHERE id = job.id;
  END LOOP;
END;
$$;

-- Now migrate hardcoded cron jobs
SELECT cron.unschedule('fetch-daily-aws-costs') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fetch-daily-aws-costs'
);

SELECT cron.unschedule('fetch-all-accounts-costs') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fetch-all-accounts-costs'
);

SELECT cron.unschedule('endpoint-monitor-check-every-minute') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'endpoint-monitor-check-every-minute'
);

-- Insert default scheduled jobs
INSERT INTO public.scheduled_jobs (name, description, function_name, schedule, payload, is_active)
VALUES 
  (
    'Busca de Custos Diários AWS',
    'Busca automática de custos AWS de todas as contas ativas diariamente às 2h da manhã',
    'fetch-daily-costs',
    '0 2 * * *',
    '{"days": 30}'::jsonb,
    true
  ),
  (
    'Validação de Credenciais AWS',
    'Valida conexão e permissões das credenciais AWS a cada 6 horas',
    'validate-aws-credentials',
    '0 */6 * * *',
    '{}'::jsonb,
    true
  ),
  (
    'Monitoramento de Endpoints',
    'Verifica health de todos os endpoints configurados a cada minuto',
    'endpoint-monitor-check',
    '* * * * *',
    '{}'::jsonb,
    true
  ),
  (
    'Detecção de Anomalias de Custo',
    'Analisa padrões de custo para detectar anomalias semanalmente',
    'anomaly-detection',
    '0 3 * * 0',
    '{}'::jsonb,
    false
  ),
  (
    'Predição de Incidentes (ML)',
    'Executa modelo de ML para predição de incidentes semanalmente',
    'predict-incidents',
    '0 4 * * 0',
    '{}'::jsonb,
    false
  )
ON CONFLICT DO NOTHING;

-- Sync to cron
SELECT public.sync_cron_jobs();