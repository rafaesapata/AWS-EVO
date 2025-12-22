-- ============================================
-- CRITICAL SECURITY FIX: Organization Isolation
-- Remove insecure RLS policies and enforce strict organization filtering
-- ============================================

-- ==================== SECURITY_POSTURE ====================
-- CRITICAL: Remove public access policy that allows cross-org data access
DROP POLICY IF EXISTS "Allow public access to security_posture" ON public.security_posture;

-- Keep only the secure organization-filtered policy
-- Policy already exists: "Users can view their org security posture"
-- No action needed, it correctly filters by organization_id


-- ==================== FINDINGS ====================
-- Remove duplicate/overlapping policies, keep only the most restrictive

-- Remove less specific policy
DROP POLICY IF EXISTS "Users can view their org findings" ON public.findings;

-- Keep the more comprehensive policy that includes super_admin support:
-- "Users can view findings in their organization only"
-- This policy already exists and correctly filters by organization_id


-- ==================== SECURITY_SCANS ====================
-- Remove policies with NULL organization_id checks (less secure)

DROP POLICY IF EXISTS "Users can view scans in their organization" ON public.security_scans;
DROP POLICY IF EXISTS "Users can update scans in their organization" ON public.security_scans;

-- Keep only strict organization filtering policies:
-- "Users can view scans in their organization only"
-- "Users can update scans in their organization only"
-- These policies enforce NOT NULL organization_id and filter correctly


-- ==================== ADD MISSING DELETE POLICIES ====================
-- Ensure users can only delete findings in their organization

CREATE POLICY "Users can delete findings in their organization only"
ON public.findings
FOR DELETE
TO public
USING (
  organization_id IS NOT NULL 
  AND (
    organization_id = get_user_organization(auth.uid())
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
);

-- ==================== VERIFICATION ====================
-- After this migration, all security tables will enforce strict organization isolation:
-- 1. security_posture: Filters by organization_id via get_user_organization()
-- 2. findings: Filters by organization_id with super_admin support
-- 3. security_scans: Filters by organization_id with NOT NULL enforcement
-- 4. security_scans_history: Filters by organization_id via profiles table