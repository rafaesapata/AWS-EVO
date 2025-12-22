-- Fix all remaining 8 functions without search_path to reach 100%

-- Fix audit_table_changes
CREATE OR REPLACE FUNCTION public.audit_table_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Track INSERT
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.audit_log (user_id, action, resource_type, resource_id, details)
    VALUES (
      auth.uid(), -- Can be null for system operations
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
      auth.uid(), -- Can be null for system operations
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
      auth.uid(), -- Can be null for system operations
      'DELETE',
      TG_TABLE_NAME,
      OLD.id,
      jsonb_build_object('old_data', to_jsonb(OLD))
    );
    RETURN OLD;
  END IF;
END;
$$;

-- Fix sync_cron_jobs
CREATE OR REPLACE FUNCTION public.sync_cron_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
        current_setting('app.settings.supabase_url', true) || '/functions/v1/' || job.function_name,
        jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key', true)),
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

-- Fix calculate_daily_metrics
CREATE OR REPLACE FUNCTION public.calculate_daily_metrics(p_scan_id uuid)
RETURNS void 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_account_id uuid;
  v_wa_score numeric;
  v_total_findings integer;
  v_critical_findings integer;
  v_high_findings integer;
  v_total_savings numeric;
  v_resolved integer;
  v_pending integer;
BEGIN
  -- Get account ID from scan
  SELECT aws_account_id INTO v_account_id FROM public.security_scans WHERE id = p_scan_id;
  
  -- Calculate Well-Architected score
  SELECT AVG(score) INTO v_wa_score FROM public.well_architected_scores WHERE scan_id = p_scan_id;
  
  -- Count findings
  SELECT COUNT(*), 
         SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END),
         SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END)
  INTO v_total_findings, v_critical_findings, v_high_findings
  FROM public.findings WHERE scan_type = (SELECT scan_type FROM public.security_scans WHERE id = p_scan_id);
  
  -- Calculate total savings
  SELECT SUM(projected_savings_yearly) INTO v_total_savings 
  FROM public.cost_recommendations WHERE scan_id = p_scan_id;
  
  -- Count tickets
  SELECT 
    SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END),
    SUM(CASE WHEN status IN ('pending', 'in_progress') THEN 1 ELSE 0 END)
  INTO v_resolved, v_pending
  FROM public.remediation_tickets;
  
  -- Insert metrics
  INSERT INTO public.scan_history_metrics (
    scan_id, aws_account_id, metric_date, 
    well_architected_score, total_findings, critical_findings, high_findings,
    total_cost_savings, resolved_tickets, pending_tickets
  ) VALUES (
    p_scan_id, v_account_id, CURRENT_DATE,
    v_wa_score, v_total_findings, v_critical_findings, v_high_findings,
    v_total_savings, v_resolved, v_pending
  )
  ON CONFLICT (scan_id) DO UPDATE SET
    well_architected_score = EXCLUDED.well_architected_score,
    total_findings = EXCLUDED.total_findings,
    critical_findings = EXCLUDED.critical_findings,
    high_findings = EXCLUDED.high_findings,
    total_cost_savings = EXCLUDED.total_cost_savings,
    resolved_tickets = EXCLUDED.resolved_tickets,
    pending_tickets = EXCLUDED.pending_tickets;
END;
$$;

-- Fix create_notification (if it exists without search_path)
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_data JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (p_user_id, p_type, p_title, p_message, p_data)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist yet, ignore
    RETURN NULL;
END;
$$;

-- Fix extract_missing_permissions
CREATE OR REPLACE FUNCTION public.extract_missing_permissions(error_message TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
AS $$
DECLARE
  permissions TEXT[];
BEGIN
  -- Extract permission names from AWS error messages
  -- Example: "User: ... is not authorized to perform: ec2:DescribeInstances"
  permissions := regexp_matches(error_message, 'perform: ([a-zA-Z0-9:,\s]+)', 'g');
  
  IF permissions IS NULL THEN
    RETURN ARRAY[]::TEXT[];
  END IF;
  
  RETURN string_to_array(permissions[1], ',');
EXCEPTION
  WHEN OTHERS THEN
    RETURN ARRAY[]::TEXT[];
END;
$$;

-- Fix log_permission_error
CREATE OR REPLACE FUNCTION public.log_permission_error(
  p_aws_account_id UUID,
  p_error_message TEXT,
  p_missing_permissions TEXT[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.aws_permission_errors (
    aws_account_id,
    error_message,
    missing_permissions,
    detected_at
  )
  VALUES (
    p_aws_account_id,
    p_error_message,
    p_missing_permissions,
    now()
  );
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist, ignore
    NULL;
END;
$$;