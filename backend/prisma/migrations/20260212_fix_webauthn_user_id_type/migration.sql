-- Fix WebAuthn tables user_id type: change from uuid to text
-- to match profiles.user_id which stores Cognito sub as text

-- webauthn_challenges: change user_id from uuid to text
ALTER TABLE "webauthn_challenges" ALTER COLUMN "user_id" TYPE TEXT;

-- webauthn_credentials: change user_id from uuid to text  
ALTER TABLE "webauthn_credentials" ALTER COLUMN "user_id" TYPE TEXT;
