-- Adicionar campos para integração com Datadog
ALTER TABLE public.notification_settings
ADD COLUMN IF NOT EXISTS datadog_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS datadog_api_key text,
ADD COLUMN IF NOT EXISTS datadog_site text DEFAULT 'datadoghq.com';

COMMENT ON COLUMN public.notification_settings.datadog_enabled IS 'Se as notificações devem ser enviadas para o Datadog';
COMMENT ON COLUMN public.notification_settings.datadog_api_key IS 'API Key do Datadog para envio de eventos';
COMMENT ON COLUMN public.notification_settings.datadog_site IS 'Site do Datadog (datadoghq.com, datadoghq.eu, etc)';