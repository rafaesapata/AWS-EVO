-- Migration: Link existing users to UDS organization
-- Description: Creates UDS organization and links all existing users without organization

-- Step 1: Create UDS organization if it doesn't exist
INSERT INTO organizations (id, name, slug, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'UDS',
  'uds',
  NOW(),
  NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- Step 2: Get UDS organization ID
DO $$
DECLARE
  uds_org_id UUID;
  user_record RECORD;
BEGIN
  -- Get UDS organization ID
  SELECT id INTO uds_org_id FROM organizations WHERE slug = 'uds';
  
  -- Log the organization ID
  RAISE NOTICE 'UDS Organization ID: %', uds_org_id;
  
  -- Step 3: Find users from Cognito that don't have profiles
  -- Note: This assumes you have a way to identify Cognito users
  -- You may need to adjust this based on your user management system
  
  -- For now, we'll create a placeholder that can be customized
  -- Example: Link users based on audit_logs or other tables that reference user_id
  
  -- Create profiles for users found in audit_logs but not in profiles
  INSERT INTO profiles (id, user_id, organization_id, role, created_at, updated_at)
  SELECT 
    gen_random_uuid(),
    DISTINCT al.user_id,
    uds_org_id,
    'user',
    NOW(),
    NOW()
  FROM audit_logs al
  WHERE al.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM profiles p WHERE p.user_id = al.user_id
    )
  ON CONFLICT (user_id, organization_id) DO NOTHING;
  
  -- Create profiles for users found in api_logs but not in profiles
  INSERT INTO profiles (id, user_id, organization_id, role, created_at, updated_at)
  SELECT 
    gen_random_uuid(),
    DISTINCT apl.user_id,
    uds_org_id,
    'user',
    NOW(),
    NOW()
  FROM api_logs apl
  WHERE apl.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM profiles p WHERE p.user_id = apl.user_id
    )
  ON CONFLICT (user_id, organization_id) DO NOTHING;
  
  -- Log completion
  RAISE NOTICE 'Migration completed successfully';
END $$;

-- Step 4: Verify the migration
SELECT 
  o.name as organization_name,
  COUNT(p.id) as user_count
FROM organizations o
LEFT JOIN profiles p ON p.organization_id = o.id
WHERE o.slug = 'uds'
GROUP BY o.name;

-- Step 5: Show users without organization (should be empty after migration)
SELECT 
  al.user_id,
  COUNT(*) as activity_count
FROM audit_logs al
WHERE al.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = al.user_id
  )
GROUP BY al.user_id
LIMIT 10;
