-- Create table for scheduled jobs management
CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  function_name TEXT NOT NULL,
  schedule TEXT NOT NULL, -- cron format
  payload JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  run_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for AWS credential validation status
CREATE TABLE IF NOT EXISTS public.aws_validation_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id UUID REFERENCES public.aws_credentials(id) ON DELETE CASCADE,
  is_connected BOOLEAN DEFAULT false,
  has_all_permissions BOOLEAN DEFAULT false,
  missing_permissions JSONB DEFAULT '[]'::jsonb,
  last_validated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  validation_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(aws_account_id)
);

-- Enable RLS
ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aws_validation_status ENABLE ROW LEVEL SECURITY;

-- RLS policies for scheduled_jobs
CREATE POLICY "Super admins can manage scheduled jobs"
  ON public.scheduled_jobs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'::app_role
    )
  );

-- RLS policies for aws_validation_status
CREATE POLICY "Users can view AWS validation in their org"
  ON public.aws_validation_status
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.aws_credentials ac
      WHERE ac.id = aws_validation_status.aws_account_id
      AND (
        ac.organization_id IS NULL 
        OR ac.organization_id = get_user_organization(auth.uid())
        OR has_role(auth.uid(), 'super_admin'::app_role)
      )
    )
  );

CREATE POLICY "System can insert/update AWS validation"
  ON public.aws_validation_status
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add trigger to update updated_at
CREATE TRIGGER update_scheduled_jobs_updated_at
  BEFORE UPDATE ON public.scheduled_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_aws_validation_status_updated_at
  BEFORE UPDATE ON public.aws_validation_status
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to sync cron jobs from scheduled_jobs table
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
    
    -- Update next_run_at
    UPDATE public.scheduled_jobs
    SET next_run_at = (
      SELECT schedule 
      FROM cron.job 
      WHERE jobid = job_id
    )
    WHERE id = job.id;
  END LOOP;
END;
$$;