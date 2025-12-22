-- Add is_system_job column to scheduled_jobs
ALTER TABLE public.scheduled_jobs 
ADD COLUMN IF NOT EXISTS is_system_job BOOLEAN DEFAULT false;

-- Update existing system jobs to be marked as system jobs
UPDATE public.scheduled_jobs
SET is_system_job = true
WHERE function_name IN (
  'fetch-daily-costs',
  'validate-aws-credentials', 
  'endpoint-monitor-check',
  'anomaly-detection',
  'predict-incidents'
);

-- Add organization_id column to scheduled_jobs
ALTER TABLE public.scheduled_jobs
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add comment to explain the difference
COMMENT ON COLUMN public.scheduled_jobs.is_system_job IS 'True if this is a system-wide job that runs for all organizations, false if it is organization-specific';
COMMENT ON COLUMN public.scheduled_jobs.organization_id IS 'If not null, this job only runs for this specific organization. Null for system jobs.';