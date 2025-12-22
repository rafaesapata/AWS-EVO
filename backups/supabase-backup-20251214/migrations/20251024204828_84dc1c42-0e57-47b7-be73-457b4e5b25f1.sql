-- Add mTLS fields to endpoint_monitors table
ALTER TABLE public.endpoint_monitors
ADD COLUMN mtls_enabled boolean DEFAULT false,
ADD COLUMN mtls_client_cert text,
ADD COLUMN mtls_client_key text,
ADD COLUMN mtls_ca_cert text;

COMMENT ON COLUMN public.endpoint_monitors.mtls_enabled IS 'Enable mutual TLS authentication';
COMMENT ON COLUMN public.endpoint_monitors.mtls_client_cert IS 'Client certificate in PEM format for mTLS';
COMMENT ON COLUMN public.endpoint_monitors.mtls_client_key IS 'Client private key in PEM format for mTLS';
COMMENT ON COLUMN public.endpoint_monitors.mtls_ca_cert IS 'CA certificate in PEM format for mTLS (optional)';