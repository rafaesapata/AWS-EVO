-- Fix profiles table unique constraints
-- The schema expects @@unique([user_id, organization_id]) but the database has separate unique constraints

-- Drop the old unique constraints that are incorrect
DROP INDEX IF EXISTS profiles_user_id_key;
DROP INDEX IF EXISTS profiles_email_key;

-- Create the correct composite unique constraint
CREATE UNIQUE INDEX profiles_user_id_organization_id_key ON profiles(user_id, organization_id);

-- Add index on email for performance (not unique - same user can have profiles in multiple orgs)
CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email);
