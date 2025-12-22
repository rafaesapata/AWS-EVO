-- Dead Letter Queue for failed background jobs
CREATE TABLE IF NOT EXISTS public.background_jobs_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id UUID NOT NULL,
  job_type TEXT NOT NULL,
  job_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  error_message TEXT,
  error_stack TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error_at TIMESTAMPTZ,
  moved_to_dlq_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reprocessed_at TIMESTAMPTZ,
  reprocess_attempts INTEGER DEFAULT 0,
  status TEXT DEFAULT 'failed' CHECK (status IN ('failed', 'reprocessing', 'resolved', 'abandoned')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for DLQ
CREATE INDEX idx_background_jobs_dlq_org ON public.background_jobs_dlq(organization_id);
CREATE INDEX idx_background_jobs_dlq_status ON public.background_jobs_dlq(status);
CREATE INDEX idx_background_jobs_dlq_job_type ON public.background_jobs_dlq(job_type);
CREATE INDEX idx_background_jobs_dlq_moved_at ON public.background_jobs_dlq(moved_to_dlq_at);

-- RLS for DLQ
ALTER TABLE public.background_jobs_dlq ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view DLQ jobs from their organization"
  ON public.background_jobs_dlq FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Admins can manage DLQ jobs"
  ON public.background_jobs_dlq FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('org_admin', 'super_admin')
    )
  );

-- System alerts configuration table
CREATE TABLE IF NOT EXISTS public.system_alerts_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id),
  alert_type TEXT NOT NULL,
  threshold_value NUMERIC,
  threshold_unit TEXT,
  is_enabled BOOLEAN DEFAULT true,
  notification_channels JSONB DEFAULT '["in_app"]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, alert_type)
);

-- RLS for alerts config
ALTER TABLE public.system_alerts_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view alert config from their organization"
  ON public.system_alerts_config FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Admins can manage alert config"
  ON public.system_alerts_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('org_admin', 'super_admin')
    )
  );

-- Default alert configurations
INSERT INTO public.system_alerts_config (alert_type, threshold_value, threshold_unit, is_enabled)
VALUES 
  ('job_failure_rate', 10, 'percent', true),
  ('dlq_growth', 5, 'jobs_per_hour', true),
  ('health_degraded', 1, 'occurrence', true),
  ('high_error_rate', 20, 'errors_per_minute', true),
  ('memory_usage', 80, 'percent', true)
ON CONFLICT (organization_id, alert_type) DO NOTHING;

-- Function to move job to DLQ
CREATE OR REPLACE FUNCTION public.move_job_to_dlq(p_job_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_job RECORD;
  v_dlq_id UUID;
BEGIN
  -- Get job details
  SELECT * INTO v_job FROM public.background_jobs WHERE id = p_job_id;
  
  IF v_job IS NULL THEN
    RAISE EXCEPTION 'Job not found: %', p_job_id;
  END IF;
  
  -- Insert into DLQ
  INSERT INTO public.background_jobs_dlq (
    original_job_id,
    job_type,
    job_name,
    payload,
    organization_id,
    error_message,
    error_stack,
    failure_count,
    last_error_at
  ) VALUES (
    v_job.id,
    v_job.job_type,
    v_job.job_name,
    v_job.payload,
    v_job.organization_id,
    v_job.error_message,
    v_job.error_stack,
    v_job.retry_count + 1,
    now()
  ) RETURNING id INTO v_dlq_id;
  
  -- Update original job status
  UPDATE public.background_jobs
  SET status = 'moved_to_dlq',
      updated_at = now()
  WHERE id = p_job_id;
  
  -- Log the move
  INSERT INTO public.job_logs (job_id, log_level, message, metadata)
  VALUES (
    p_job_id,
    'error',
    'Job moved to Dead Letter Queue after exceeding max retries',
    jsonb_build_object('dlq_id', v_dlq_id, 'failure_count', v_job.retry_count + 1)
  );
  
  RETURN v_dlq_id;
END;
$function$;

-- Function to reprocess job from DLQ
CREATE OR REPLACE FUNCTION public.reprocess_dlq_job(p_dlq_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_dlq_job RECORD;
  v_new_job_id UUID;
BEGIN
  -- Get DLQ job details
  SELECT * INTO v_dlq_job FROM public.background_jobs_dlq WHERE id = p_dlq_id;
  
  IF v_dlq_job IS NULL THEN
    RAISE EXCEPTION 'DLQ job not found: %', p_dlq_id;
  END IF;
  
  -- Create new job from DLQ entry
  INSERT INTO public.background_jobs (
    job_type,
    job_name,
    payload,
    organization_id,
    status,
    priority,
    created_by
  ) VALUES (
    v_dlq_job.job_type,
    v_dlq_job.job_name,
    v_dlq_job.payload,
    v_dlq_job.organization_id,
    'pending',
    10, -- High priority for reprocessed jobs
    auth.uid()
  ) RETURNING id INTO v_new_job_id;
  
  -- Update DLQ entry
  UPDATE public.background_jobs_dlq
  SET status = 'reprocessing',
      reprocessed_at = now(),
      reprocess_attempts = reprocess_attempts + 1,
      updated_at = now()
  WHERE id = p_dlq_id;
  
  RETURN v_new_job_id;
END;
$function$;

-- Trigger to update updated_at
CREATE TRIGGER update_background_jobs_dlq_updated_at
  BEFORE UPDATE ON public.background_jobs_dlq
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_system_alerts_config_updated_at
  BEFORE UPDATE ON public.system_alerts_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();