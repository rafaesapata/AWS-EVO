-- Ticket System Improvements: Watchers, Assignment Rules, State Machine support
-- 1. Ticket Watchers (subscribers)
-- 2. Assignment Rules (auto-assignment)
-- 3. Assignment round-robin tracking

-- ==================== TICKET WATCHERS ====================
CREATE TABLE IF NOT EXISTS "ticket_watchers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "user_name" TEXT,
    "user_email" TEXT,
    "watch_type" TEXT NOT NULL DEFAULT 'all', -- all, status_only, comments_only
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_watchers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ticket_watchers_ticket_user_key" ON "ticket_watchers"("ticket_id", "user_id");
CREATE INDEX IF NOT EXISTS "ticket_watchers_ticket_id_idx" ON "ticket_watchers"("ticket_id");
CREATE INDEX IF NOT EXISTS "ticket_watchers_user_id_idx" ON "ticket_watchers"("user_id");

ALTER TABLE "ticket_watchers"
ADD CONSTRAINT "ticket_watchers_ticket_id_fkey"
FOREIGN KEY ("ticket_id") REFERENCES "remediation_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==================== ASSIGNMENT RULES ====================
CREATE TABLE IF NOT EXISTS "assignment_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0, -- Higher = evaluated first
    "match_severity" TEXT, -- null = any
    "match_category" TEXT, -- null = any
    "match_service" TEXT, -- null = any
    "strategy" TEXT NOT NULL DEFAULT 'specific_user', -- specific_user, round_robin
    "assign_to" UUID, -- For specific_user strategy
    "round_robin_pool" UUID[] DEFAULT ARRAY[]::UUID[], -- For round_robin strategy
    "round_robin_index" INTEGER NOT NULL DEFAULT 0, -- Current position in pool
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "assignment_rules_org_id_idx" ON "assignment_rules"("organization_id");
CREATE INDEX IF NOT EXISTS "assignment_rules_is_active_idx" ON "assignment_rules"("is_active");
CREATE INDEX IF NOT EXISTS "assignment_rules_priority_idx" ON "assignment_rules"("priority" DESC);

ALTER TABLE "assignment_rules"
ADD CONSTRAINT "assignment_rules_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
