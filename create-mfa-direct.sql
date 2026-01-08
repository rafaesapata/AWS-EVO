CREATE TABLE IF NOT EXISTS mfa_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  factor_type VARCHAR(50) NOT NULL,
  friendly_name VARCHAR(255),
  secret TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  is_active BOOLEAN NOT NULL DEFAULT true,
  verified_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS mfa_factors_user_id_idx ON mfa_factors(user_id);
CREATE INDEX IF NOT EXISTS mfa_factors_is_active_idx ON mfa_factors(is_active);
