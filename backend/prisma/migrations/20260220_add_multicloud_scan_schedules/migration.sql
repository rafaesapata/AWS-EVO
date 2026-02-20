-- CreateEnum (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CloudProvider') THEN
    CREATE TYPE "CloudProvider" AS ENUM ('AWS', 'AZURE');
  END IF;
END $$;

-- AlterTable: make aws_account_id nullable for Azure scans
ALTER TABLE "scan_schedules" ALTER COLUMN "aws_account_id" DROP NOT NULL;

-- AlterTable: add cloud_provider column with default AWS
ALTER TABLE "scan_schedules" ADD COLUMN IF NOT EXISTS "cloud_provider" "CloudProvider" NOT NULL DEFAULT 'AWS';

-- AlterTable: add azure_credential_id column
ALTER TABLE "scan_schedules" ADD COLUMN IF NOT EXISTS "azure_credential_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scan_schedules_cloud_provider_idx" ON "scan_schedules"("cloud_provider");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scan_schedules_azure_credential_id_idx" ON "scan_schedules"("azure_credential_id");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'scan_schedules_azure_credential_id_fkey'
  ) THEN
    ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_azure_credential_id_fkey" 
      FOREIGN KEY ("azure_credential_id") REFERENCES "azure_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
