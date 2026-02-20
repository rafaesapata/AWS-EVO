-- CreateEnum: tag_category
DO $$ BEGIN
  CREATE TYPE "tag_category" AS ENUM ('COST_CENTER', 'ENVIRONMENT', 'TEAM', 'PROJECT', 'COMPLIANCE', 'CRITICALITY', 'CUSTOM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable: tags
CREATE TABLE IF NOT EXISTS "tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "value" VARCHAR(128) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "category" "tag_category" NOT NULL DEFAULT 'CUSTOM',
    "description" VARCHAR(256),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable: resource_tag_assignments
CREATE TABLE IF NOT EXISTS "resource_tag_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "resource_id" VARCHAR(512) NOT NULL,
    "resource_type" VARCHAR(128) NOT NULL,
    "cloud_provider" VARCHAR(10) NOT NULL,
    "resource_name" VARCHAR(256),
    "resource_region" VARCHAR(64),
    "aws_account_id" VARCHAR(12),
    "azure_credential_id" UUID,
    "assigned_by" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_tag_assignments_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tag_org_key_value" ON "tags"("organization_id", "key", "value");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_assignment_org_tag_resource" ON "resource_tag_assignments"("organization_id", "tag_id", "resource_id");

-- Indexes: tags
CREATE INDEX IF NOT EXISTS "tags_organization_id_category_idx" ON "tags"("organization_id", "category");
CREATE INDEX IF NOT EXISTS "tags_organization_id_key_idx" ON "tags"("organization_id", "key");

-- Indexes: resource_tag_assignments
CREATE INDEX IF NOT EXISTS "rta_organization_id_resource_id_idx" ON "resource_tag_assignments"("organization_id", "resource_id");
CREATE INDEX IF NOT EXISTS "rta_organization_id_tag_id_idx" ON "resource_tag_assignments"("organization_id", "tag_id");
CREATE INDEX IF NOT EXISTS "rta_organization_id_resource_type_cloud_provider_idx" ON "resource_tag_assignments"("organization_id", "resource_type", "cloud_provider");
CREATE INDEX IF NOT EXISTS "rta_resource_id_idx" ON "resource_tag_assignments"("resource_id");

-- Foreign keys
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_organization_id_fkey";
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resource_tag_assignments" DROP CONSTRAINT IF EXISTS "resource_tag_assignments_organization_id_fkey";
ALTER TABLE "resource_tag_assignments" ADD CONSTRAINT "resource_tag_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resource_tag_assignments" DROP CONSTRAINT IF EXISTS "resource_tag_assignments_tag_id_fkey";
ALTER TABLE "resource_tag_assignments" ADD CONSTRAINT "resource_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
