-- Tag Hierarchy: add parent_id to tags
ALTER TABLE tags ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tags(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tags_parent_id ON tags(parent_id);

-- Tag merge/rename audit log support (uses existing audit_logs table)
-- No new tables needed, just tracking via audit_service
