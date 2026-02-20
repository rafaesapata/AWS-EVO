-- Fix FK: scan_schedules.aws_account_id should reference aws_credentials (not aws_accounts)
-- The original migration incorrectly pointed to aws_accounts table

-- Drop the incorrect FK
ALTER TABLE "scan_schedules" DROP CONSTRAINT IF EXISTS "scan_schedules_aws_account_id_fkey";

-- Recreate FK pointing to aws_credentials
ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_aws_account_id_fkey" 
  FOREIGN KEY ("aws_account_id") REFERENCES "aws_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
