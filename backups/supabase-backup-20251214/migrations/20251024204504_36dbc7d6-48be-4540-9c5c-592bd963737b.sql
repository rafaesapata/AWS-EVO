-- Add pre-authentication fields to endpoint_monitors table
ALTER TABLE public.endpoint_monitors
ADD COLUMN pre_auth_enabled boolean DEFAULT false,
ADD COLUMN pre_auth_url text,
ADD COLUMN pre_auth_method text DEFAULT 'POST',
ADD COLUMN pre_auth_body text,
ADD COLUMN pre_auth_headers jsonb DEFAULT '{}'::jsonb,
ADD COLUMN pre_auth_token_path text,
ADD COLUMN pre_auth_token_header_name text DEFAULT 'Authorization',
ADD COLUMN pre_auth_token_prefix text DEFAULT 'Bearer ';

COMMENT ON COLUMN public.endpoint_monitors.pre_auth_enabled IS 'Enable pre-authentication flow';
COMMENT ON COLUMN public.endpoint_monitors.pre_auth_url IS 'URL to call for authentication';
COMMENT ON COLUMN public.endpoint_monitors.pre_auth_method IS 'HTTP method for auth endpoint';
COMMENT ON COLUMN public.endpoint_monitors.pre_auth_body IS 'Body to send to auth endpoint';
COMMENT ON COLUMN public.endpoint_monitors.pre_auth_headers IS 'Headers for auth request';
COMMENT ON COLUMN public.endpoint_monitors.pre_auth_token_path IS 'JSON path to extract token from response (e.g., "data.token" or "access_token")';
COMMENT ON COLUMN public.endpoint_monitors.pre_auth_token_header_name IS 'Header name to use for the token in monitored endpoint';
COMMENT ON COLUMN public.endpoint_monitors.pre_auth_token_prefix IS 'Prefix to add before token (e.g., "Bearer ")';