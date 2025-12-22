-- Criar rotina automática para buscar custos diariamente da AWS
-- Remove agendamento anterior se existir
SELECT cron.unschedule('fetch-daily-aws-costs') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fetch-daily-aws-costs'
);

-- Agendar busca de custos diários toda noite às 2h (horário UTC)
SELECT cron.schedule(
  'fetch-daily-aws-costs',
  '0 2 * * *', -- Executa às 2h da manhã todos os dias
  $$
  SELECT
    net.http_post(
        url:='https://bsluqzxeexanydqvmbrh.supabase.co/functions/v1/fetch-daily-costs',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzbHVxenhlZXhhbnlkcXZtYnJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNDUzODksImV4cCI6MjA3NjgyMTM4OX0.SJBE0YCcdFagIJHJArVwGk6mV9x6r3Yocdc3ySxpO5A"}'::jsonb,
        body:=jsonb_build_object(
          'accountId', (SELECT id FROM public.aws_credentials WHERE is_active = true ORDER BY created_at DESC LIMIT 1),
          'days', 7
        )
    ) as request_id;
  $$
);

-- Criar função helper para buscar custos de todas as contas ativas
CREATE OR REPLACE FUNCTION public.fetch_all_accounts_costs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  account RECORD;
BEGIN
  FOR account IN SELECT id FROM public.aws_credentials WHERE is_active = true
  LOOP
    PERFORM net.http_post(
      url := 'https://bsluqzxeexanydqvmbrh.supabase.co/functions/v1/fetch-daily-costs',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzbHVxenhlZXhhbnlkcXZtYnJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNDUzODksImV4cCI6MjA3NjgyMTM4OX0.SJBE0YCcdFagIJHJArVwGk6mV9x6r3Yocdc3ySxpO5A"}'::jsonb,
      body := jsonb_build_object(
        'accountId', account.id,
        'days', 7
      )
    );
  END LOOP;
END;
$$;

-- Agendar busca para todas as contas ativas
SELECT cron.unschedule('fetch-all-accounts-costs') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fetch-all-accounts-costs'
);

SELECT cron.schedule(
  'fetch-all-accounts-costs',
  '0 2 * * *', -- Executa às 2h da manhã todos os dias
  $$
  SELECT public.fetch_all_accounts_costs();
  $$
);

-- Comentário explicativo
COMMENT ON FUNCTION public.fetch_all_accounts_costs IS 
'Função que busca custos diários de todas as contas AWS ativas. Executada automaticamente todos os dias às 2h UTC pelo cron job.';

-- Log de agendamento
DO $$
BEGIN
  RAISE NOTICE '✅ Rotina automática de atualização de custos configurada com sucesso!';
  RAISE NOTICE '📅 Executa diariamente às 2h UTC (23h horário de Brasília)';
  RAISE NOTICE '📊 Busca os últimos 7 dias de custos de todas as contas AWS ativas';
END $$;