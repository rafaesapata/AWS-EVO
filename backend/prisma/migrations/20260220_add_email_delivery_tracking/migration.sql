-- CreateTable
CREATE TABLE "email_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "message_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "sender" TEXT,
    "subject" TEXT,
    "bounce_type" TEXT,
    "bounce_sub_type" TEXT,
    "complaint_type" TEXT,
    "diagnostic" TEXT,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,
    "raw_event" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_events_message_id_idx" ON "email_events"("message_id");
CREATE INDEX "email_events_organization_id_idx" ON "email_events"("organization_id");
CREATE INDEX "email_events_recipient_idx" ON "email_events"("recipient");
CREATE INDEX "email_events_event_type_idx" ON "email_events"("event_type");
CREATE INDEX "email_events_timestamp_idx" ON "email_events"("timestamp");
