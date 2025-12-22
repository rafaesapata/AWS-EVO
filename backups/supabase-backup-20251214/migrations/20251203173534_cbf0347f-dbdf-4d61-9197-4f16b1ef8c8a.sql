-- Add external_id_expires_at column to aws_credentials for TTL tracking
ALTER TABLE public.aws_credentials 
ADD COLUMN IF NOT EXISTS external_id_expires_at TIMESTAMP WITH TIME ZONE;

-- Add external_id column to store the actual external ID (currently embedded in secret_access_key)
ALTER TABLE public.aws_credentials 
ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Create index for expired external IDs cleanup
CREATE INDEX IF NOT EXISTS idx_aws_credentials_external_id_expires 
ON public.aws_credentials (external_id_expires_at) 
WHERE external_id_expires_at IS NOT NULL;

-- Function to cleanup expired external IDs (not yet used)
CREATE OR REPLACE FUNCTION public.cleanup_expired_external_ids()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete credentials with expired external IDs that were never used (no validation)
  DELETE FROM public.aws_credentials
  WHERE external_id_expires_at < NOW()
    AND access_key_id LIKE 'ROLE:%'
    AND id NOT IN (
      SELECT aws_account_id FROM public.aws_validation_status 
      WHERE has_all_permissions = true
    );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log cleanup action
  IF deleted_count > 0 THEN
    INSERT INTO public.audit_log (
      user_id, action, resource_type, details
    ) VALUES (
      NULL,
      'EXTERNAL_ID_CLEANUP',
      'aws_credentials',
      jsonb_build_object('deleted_count', deleted_count, 'cleaned_at', NOW())
    );
  END IF;
  
  RETURN deleted_count;
END;
$$;

-- Table to track permission validation results
CREATE TABLE IF NOT EXISTS public.permission_validation_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  aws_account_id UUID NOT NULL REFERENCES public.aws_credentials(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id),
  total_permissions INTEGER NOT NULL DEFAULT 0,
  allowed_count INTEGER NOT NULL DEFAULT 0,
  denied_count INTEGER NOT NULL DEFAULT 0,
  missing_critical TEXT[] DEFAULT ARRAY[]::TEXT[],
  permission_details JSONB DEFAULT '[]'::JSONB,
  validated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS on permission_validation_results
ALTER TABLE public.permission_validation_results ENABLE ROW LEVEL SECURITY;

-- RLS policies for permission_validation_results
CREATE POLICY "Users can view own org permission validations" 
ON public.permission_validation_results 
FOR SELECT 
USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Service role can insert permission validations"
ON public.permission_validation_results
FOR INSERT
WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_permission_validation_account 
ON public.permission_validation_results (aws_account_id, validated_at DESC);

-- Add comment for documentation
COMMENT ON TABLE public.permission_validation_results IS 'Stores detailed permission validation results for AWS accounts';
COMMENT ON COLUMN public.aws_credentials.external_id_expires_at IS 'TTL for unused external IDs - credentials deleted if not validated before expiration';
COMMENT ON COLUMN public.aws_credentials.external_id IS 'External ID used for IAM Role trust policy';