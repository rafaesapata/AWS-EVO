-- Check user profile and organization
SELECT 
    p.id as profile_id,
    p.user_id,
    p.email,
    p.organization_id,
    p.role,
    o.name as org_name
FROM profiles p
LEFT JOIN organizations o ON p.organization_id = o.id
WHERE p.email = 'comercial+evo@uds.com.br'
ORDER BY p.created_at DESC
LIMIT 5;

-- Check organization license config
SELECT 
    olc.organization_id,
    olc.customer_id,
    olc.auto_sync,
    olc.sync_status,
    olc.last_sync_at,
    olc.sync_error
FROM organization_license_configs olc
WHERE olc.organization_id IN (
    SELECT organization_id FROM profiles WHERE email = 'comercial+evo@uds.com.br'
);

-- Check licenses for the organization
SELECT 
    l.id,
    l.organization_id,
    l.license_key,
    l.product_type,
    l.plan_type,
    l.is_active,
    l.is_expired,
    l.is_trial,
    l.max_users,
    l.valid_from,
    l.valid_until,
    (SELECT COUNT(*) FROM license_seat_assignments WHERE license_id = l.id) as used_seats
FROM licenses l
WHERE l.organization_id IN (
    SELECT organization_id FROM profiles WHERE email = 'comercial+evo@uds.com.br'
)
ORDER BY l.created_at DESC;

-- Check seat assignments for this user
SELECT 
    lsa.id,
    lsa.user_id,
    lsa.license_id,
    lsa.assigned_at,
    l.license_key,
    l.product_type,
    l.is_active
FROM license_seat_assignments lsa
JOIN licenses l ON lsa.license_id = l.id
WHERE lsa.user_id IN (
    SELECT user_id FROM profiles WHERE email = 'comercial+evo@uds.com.br'
);
