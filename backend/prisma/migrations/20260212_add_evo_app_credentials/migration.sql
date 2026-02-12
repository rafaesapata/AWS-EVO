-- CreateTable
CREATE TABLE IF NOT EXISTS "evo_app_credentials" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "provider" TEXT NOT NULL DEFAULT 'azure',
    "client_id" TEXT NOT NULL,
    "client_secret_masked" TEXT,
    "secret_expires_at" TIMESTAMPTZ,
    "redirect_uri" TEXT,
    "ssm_synced_at" TIMESTAMPTZ,
    "lambdas_synced_at" TIMESTAMPTZ,
    "lambdas_synced_count" INTEGER DEFAULT 0,
    "notes" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evo_app_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "evo_app_credentials_provider_client_id_key" ON "evo_app_credentials"("provider", "client_id");
