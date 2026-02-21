-- Auto-Tagging Rules Engine
CREATE TABLE IF NOT EXISTS tag_auto_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Conditions: JSON array of {field, operator, value}
  -- field: 'service', 'cloud_provider', 'account_id', 'resource_name', 'cost_gt', 'cost_lt'
  -- operator: 'equals', 'contains', 'starts_with', 'ends_with', 'regex', 'gt', 'lt'
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Actions: array of tag IDs to apply
  tag_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  -- Execution tracking
  last_run_at TIMESTAMPTZ(6),
  last_run_matched INTEGER DEFAULT 0,
  last_run_applied INTEGER DEFAULT 0,
  total_applied INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tag_auto_rules_org ON tag_auto_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_tag_auto_rules_active ON tag_auto_rules(organization_id, is_active) WHERE is_active = true;
