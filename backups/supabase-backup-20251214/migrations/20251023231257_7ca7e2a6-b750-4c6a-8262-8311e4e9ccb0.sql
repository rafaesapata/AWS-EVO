-- User roles and permissions (RBAC)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('viewer', 'analyst', 'admin')),
  permissions jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  UNIQUE(user_id)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own role" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (true) WITH CHECK (true);

-- Audit log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit log" ON public.audit_log FOR SELECT USING (true);

-- Notification settings
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_enabled boolean DEFAULT true,
  webhook_url text,
  webhook_enabled boolean DEFAULT false,
  slack_webhook_url text,
  slack_enabled boolean DEFAULT false,
  notify_on_critical boolean DEFAULT true,
  notify_on_high boolean DEFAULT true,
  notify_on_medium boolean DEFAULT false,
  notify_on_scan_complete boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their notifications" ON public.notification_settings FOR ALL USING (true) WITH CHECK (true);

-- Notification history
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  severity text,
  related_resource_id uuid,
  related_resource_type text,
  read boolean DEFAULT false,
  sent_via text[] DEFAULT ARRAY[]::text[],
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON public.audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, read) WHERE read = false;

-- Triggers
CREATE TRIGGER update_notification_settings_updated_at BEFORE UPDATE ON public.notification_settings 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to log audit actions
CREATE OR REPLACE FUNCTION public.log_audit_action(
  p_user_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.audit_log (user_id, action, resource_type, resource_id, details)
  VALUES (p_user_id, p_action, p_resource_type, p_resource_id, p_details)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notification
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_severity text DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_resource_type text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  INSERT INTO public.notifications (
    user_id, type, title, message, severity, 
    related_resource_id, related_resource_type
  )
  VALUES (
    p_user_id, p_type, p_title, p_message, p_severity,
    p_resource_id, p_resource_type
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;