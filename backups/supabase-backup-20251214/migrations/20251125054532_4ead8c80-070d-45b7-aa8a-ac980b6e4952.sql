-- Add customer_id to organizations table
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS customer_id UUID;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_organizations_customer_id ON public.organizations(customer_id);

-- Add comment
COMMENT ON COLUMN public.organizations.customer_id IS 'ID do cliente na plataforma de licenças externa';