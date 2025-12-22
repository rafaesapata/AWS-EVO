-- Add columns for password management
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMP WITH TIME ZONE;

-- Create function to track all database changes for audit
CREATE OR REPLACE FUNCTION public.audit_table_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Track INSERT
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.audit_log (user_id, action, resource_type, resource_id, details)
    VALUES (
      auth.uid(),
      'INSERT',
      TG_TABLE_NAME,
      NEW.id,
      jsonb_build_object('new_data', to_jsonb(NEW))
    );
    RETURN NEW;
  
  -- Track UPDATE
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.audit_log (user_id, action, resource_type, resource_id, details)
    VALUES (
      auth.uid(),
      'UPDATE',
      TG_TABLE_NAME,
      NEW.id,
      jsonb_build_object('old_data', to_jsonb(OLD), 'new_data', to_jsonb(NEW))
    );
    RETURN NEW;
  
  -- Track DELETE
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.audit_log (user_id, action, resource_type, resource_id, details)
    VALUES (
      auth.uid(),
      'DELETE',
      TG_TABLE_NAME,
      OLD.id,
      jsonb_build_object('old_data', to_jsonb(OLD))
    );
    RETURN OLD;
  END IF;
END;
$$;

-- Add audit triggers to key tables
CREATE TRIGGER audit_aws_credentials
  AFTER INSERT OR UPDATE OR DELETE ON public.aws_credentials
  FOR EACH ROW EXECUTE FUNCTION public.audit_table_changes();

CREATE TRIGGER audit_cost_recommendations
  AFTER INSERT OR UPDATE OR DELETE ON public.cost_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.audit_table_changes();

CREATE TRIGGER audit_findings
  AFTER INSERT OR UPDATE OR DELETE ON public.findings
  FOR EACH ROW EXECUTE FUNCTION public.audit_table_changes();

CREATE TRIGGER audit_remediation_tickets
  AFTER INSERT OR UPDATE OR DELETE ON public.remediation_tickets
  FOR EACH ROW EXECUTE FUNCTION public.audit_table_changes();

CREATE TRIGGER audit_security_scans
  AFTER INSERT OR UPDATE OR DELETE ON public.security_scans
  FOR EACH ROW EXECUTE FUNCTION public.audit_table_changes();

CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_table_changes();

CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_table_changes();

-- WAF and Security Group validation tables
CREATE TABLE IF NOT EXISTS public.waf_validations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID REFERENCES public.security_scans(id),
  resource_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_name TEXT,
  is_public BOOLEAN NOT NULL,
  has_waf BOOLEAN DEFAULT false,
  waf_name TEXT,
  waf_rules JSONB,
  security_groups JSONB,
  sg_properly_configured BOOLEAN DEFAULT false,
  sg_issues JSONB,
  risk_level TEXT NOT NULL, -- critical, high, medium, low
  recommendations TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_waf_validations_scan ON public.waf_validations(scan_id);
CREATE INDEX idx_waf_validations_risk ON public.waf_validations(risk_level);

ALTER TABLE public.waf_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public access to waf_validations" 
ON public.waf_validations FOR ALL USING (true) WITH CHECK (true);

-- Add audit trigger for WAF validations
CREATE TRIGGER audit_waf_validations
  AFTER INSERT OR UPDATE OR DELETE ON public.waf_validations
  FOR EACH ROW EXECUTE FUNCTION public.audit_table_changes();