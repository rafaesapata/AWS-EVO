-- Adicionar campos para integração com Graylog e Zabbix
ALTER TABLE public.notification_settings
ADD COLUMN IF NOT EXISTS graylog_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS graylog_url text,
ADD COLUMN IF NOT EXISTS graylog_port integer DEFAULT 12201,
ADD COLUMN IF NOT EXISTS zabbix_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS zabbix_url text,
ADD COLUMN IF NOT EXISTS zabbix_auth_token text;

COMMENT ON COLUMN public.notification_settings.graylog_enabled IS 'Se as notificações devem ser enviadas para o Graylog';
COMMENT ON COLUMN public.notification_settings.graylog_url IS 'URL do servidor Graylog (ex: http://graylog.example.com)';
COMMENT ON COLUMN public.notification_settings.graylog_port IS 'Porta GELF HTTP do Graylog';
COMMENT ON COLUMN public.notification_settings.zabbix_enabled IS 'Se as notificações devem ser enviadas para o Zabbix';
COMMENT ON COLUMN public.notification_settings.zabbix_url IS 'URL da API do Zabbix (ex: http://zabbix.example.com/api_jsonrpc.php)';
COMMENT ON COLUMN public.notification_settings.zabbix_auth_token IS 'Token de autenticação do Zabbix';