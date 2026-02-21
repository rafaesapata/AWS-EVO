-- Tag Policies table for organization-level tag governance
CREATE TABLE IF NOT EXISTS tag_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enforce_naming BOOLEAN NOT NULL DEFAULT true,
  prevent_duplicates BOOLEAN NOT NULL DEFAULT true,
  require_category BOOLEAN NOT NULL DEFAULT false,
  alert_low_coverage BOOLEAN NOT NULL DEFAULT true,
  coverage_threshold INTEGER NOT NULL DEFAULT 80,
  alert_untagged_new BOOLEAN NOT NULL DEFAULT false,
  required_keys TEXT[] NOT NULL DEFAULT ARRAY['environment', 'cost-center', 'team']::TEXT[],
  updated_by UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tag_policies_org UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_tag_policies_org ON tag_policies(organization_id);
