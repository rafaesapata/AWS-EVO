-- Add created_by column to remediation_tickets
ALTER TABLE public.remediation_tickets 
ADD COLUMN created_by uuid REFERENCES auth.users(id);

-- Create AWS API logs table for Dev Tools
CREATE TABLE public.aws_api_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id),
  aws_account_id uuid REFERENCES public.aws_credentials(id),
  user_id uuid REFERENCES auth.users(id),
  service text NOT NULL,
  operation text NOT NULL,
  request_payload jsonb,
  response_payload jsonb,
  status_code integer,
  error_message text,
  duration_ms integer,
  ip_address text,
  created_at timestamp with time zone DEFAULT now(),
  region text
);

-- Enable RLS
ALTER TABLE public.aws_api_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for aws_api_logs (only super_admin can view)
CREATE POLICY "Super admins can view all AWS API logs"
ON public.aws_api_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'::app_role
  )
);

CREATE POLICY "System can insert AWS API logs"
ON public.aws_api_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create index for better performance
CREATE INDEX idx_aws_api_logs_created_at ON public.aws_api_logs(created_at DESC);
CREATE INDEX idx_aws_api_logs_service ON public.aws_api_logs(service);
CREATE INDEX idx_aws_api_logs_organization ON public.aws_api_logs(organization_id);