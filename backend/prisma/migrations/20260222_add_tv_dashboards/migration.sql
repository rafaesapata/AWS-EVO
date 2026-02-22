-- CreateTable
CREATE TABLE "tv_dashboards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "layout" JSONB NOT NULL,
    "refresh_interval" INTEGER NOT NULL DEFAULT 30,
    "access_token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_accessed_at" TIMESTAMPTZ(6),

    CONSTRAINT "tv_dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tv_dashboards_access_token_key" ON "tv_dashboards"("access_token");

-- CreateIndex
CREATE INDEX "tv_dashboards_organization_id_idx" ON "tv_dashboards"("organization_id");

-- CreateIndex
CREATE INDEX "tv_dashboards_access_token_idx" ON "tv_dashboards"("access_token");

-- CreateIndex
CREATE INDEX "tv_dashboards_user_id_idx" ON "tv_dashboards"("user_id");
