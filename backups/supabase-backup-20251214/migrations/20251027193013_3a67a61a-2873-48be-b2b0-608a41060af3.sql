-- Update aws_credentials records that have NULL or 'Default Account' account_name
-- Set account_name to the organization name
UPDATE public.aws_credentials
SET account_name = o.name
FROM public.organizations o
WHERE aws_credentials.organization_id = o.id
  AND (
    aws_credentials.account_name IS NULL 
    OR aws_credentials.account_name = 'Default Account'
    OR aws_credentials.account_name = 'Conta AWS'
  );