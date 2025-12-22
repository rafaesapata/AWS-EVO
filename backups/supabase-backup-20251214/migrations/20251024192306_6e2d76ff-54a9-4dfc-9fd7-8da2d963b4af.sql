-- Add advanced monitoring options to endpoint_monitors
ALTER TABLE endpoint_monitors
ADD COLUMN IF NOT EXISTS inverted_check boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS validation_mode text DEFAULT 'status_code' CHECK (validation_mode IN ('status_code', 'response_body', 'both'));

COMMENT ON COLUMN endpoint_monitors.inverted_check IS 'When true, success means the endpoint should NOT respond (fail). Used to monitor that private endpoints stay private.';
COMMENT ON COLUMN endpoint_monitors.validation_mode IS 'Validation mode: status_code (only check HTTP status), response_body (check body pattern), both (check status and body)';
