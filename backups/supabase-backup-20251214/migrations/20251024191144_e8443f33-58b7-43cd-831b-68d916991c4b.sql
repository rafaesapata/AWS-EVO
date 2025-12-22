-- Add SSL monitoring fields to endpoint_monitors
ALTER TABLE endpoint_monitors
ADD COLUMN IF NOT EXISTS monitor_ssl boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ssl_expiry_days_warning integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS ssl_cert_expiry_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS ssl_cert_issuer text,
ADD COLUMN IF NOT EXISTS ssl_last_checked timestamp with time zone,
ADD COLUMN IF NOT EXISTS auto_create_ticket boolean DEFAULT false;

-- Add SSL check results to endpoint_monitor_results
ALTER TABLE endpoint_monitor_results
ADD COLUMN IF NOT EXISTS ssl_valid boolean,
ADD COLUMN IF NOT EXISTS ssl_days_until_expiry integer,
ADD COLUMN IF NOT EXISTS ssl_error text;