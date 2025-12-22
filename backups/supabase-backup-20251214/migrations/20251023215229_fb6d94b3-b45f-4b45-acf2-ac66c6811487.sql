-- Update aws_credentials table to support multiple regions
ALTER TABLE public.aws_credentials DROP COLUMN region;
ALTER TABLE public.aws_credentials ADD COLUMN regions text[] NOT NULL DEFAULT ARRAY['us-east-1'];

-- Add index for better query performance on regions
CREATE INDEX IF NOT EXISTS idx_aws_credentials_regions ON public.aws_credentials USING GIN(regions);