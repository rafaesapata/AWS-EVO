-- Create mfa_factors table
CREATE TABLE IF NOT EXISTS mfa_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  factor_type VARCHAR(50) NOT NULL,
  friendly_name VARCHAR(255),
  secret TEXT,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  verified_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_mfa_factors_user_id ON mfa_factors(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_factors_is_active ON mfa_factors(is_active);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_factors TO evo_app_user;
