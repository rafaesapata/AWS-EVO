-- CreateTable: webauthn_challenges
CREATE TABLE IF NOT EXISTS "webauthn_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "challenge" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "webauthn_challenges_user_id_idx" ON "webauthn_challenges"("user_id");
CREATE INDEX IF NOT EXISTS "webauthn_challenges_challenge_idx" ON "webauthn_challenges"("challenge");
