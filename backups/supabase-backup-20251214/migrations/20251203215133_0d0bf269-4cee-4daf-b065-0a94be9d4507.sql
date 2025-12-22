-- Communication Logs table for centralized communication tracking
CREATE TABLE public.communication_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  aws_account_id UUID REFERENCES public.aws_credentials(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Communication details
  channel TEXT NOT NULL CHECK (channel IN ('email', 'push', 'sms', 'whatsapp', 'webhook', 'slack', 'in_app', 'datadog', 'graylog', 'zabbix')),
  subject TEXT,
  message TEXT NOT NULL,
  recipient TEXT NOT NULL,
  cc TEXT[],
  bcc TEXT[],
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'bounced')),
  error_message TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  source_type TEXT, -- e.g., 'alert', 'notification', 'system', 'user_action'
  source_id TEXT, -- Reference to the source entity (alert_id, notification_id, etc.)
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX idx_communication_logs_org ON public.communication_logs(organization_id);
CREATE INDEX idx_communication_logs_account ON public.communication_logs(aws_account_id);
CREATE INDEX idx_communication_logs_channel ON public.communication_logs(channel);
CREATE INDEX idx_communication_logs_status ON public.communication_logs(status);
CREATE INDEX idx_communication_logs_created ON public.communication_logs(created_at DESC);
CREATE INDEX idx_communication_logs_recipient ON public.communication_logs(recipient);

-- Enable RLS
ALTER TABLE public.communication_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies - strict organization + account isolation
CREATE POLICY "Users can view communication logs in their organization"
  ON public.communication_logs
  FOR SELECT
  USING (
    organization_id = get_user_organization(auth.uid()) 
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Service role can insert communication logs"
  ON public.communication_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Service role can update communication logs"
  ON public.communication_logs
  FOR UPDATE
  USING (auth.role() = 'service_role'::text);

-- Comment for documentation
COMMENT ON TABLE public.communication_logs IS 'Centralized log of all communications sent by the system (email, push, sms, whatsapp, webhooks, etc.)';
COMMENT ON COLUMN public.communication_logs.channel IS 'Communication channel: email, push, sms, whatsapp, webhook, slack, in_app, datadog, graylog, zabbix';
COMMENT ON COLUMN public.communication_logs.metadata IS 'Channel-specific metadata (headers, attachments info, delivery receipts, etc.)';