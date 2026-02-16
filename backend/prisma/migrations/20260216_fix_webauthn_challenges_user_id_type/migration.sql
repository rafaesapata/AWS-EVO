-- Fix: webauthn_challenges.user_id was created as UUID but should be TEXT
-- to match profiles.user_id (Cognito sub, stored as text)
-- Also fixes webauthn_credentials.user_id for consistency

-- Fix webauthn_challenges.user_id: UUID -> TEXT
ALTER TABLE "webauthn_challenges" 
  ALTER COLUMN "user_id" TYPE TEXT USING "user_id"::TEXT;

-- Fix webauthn_credentials.user_id: UUID -> TEXT  
ALTER TABLE "webauthn_credentials" 
  ALTER COLUMN "user_id" TYPE TEXT USING "user_id"::TEXT;
