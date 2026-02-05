-- Make scan_id optional in findings table
-- The security-scan handler creates findings without scan_id in some cases
ALTER TABLE findings ALTER COLUMN scan_id DROP NOT NULL;
