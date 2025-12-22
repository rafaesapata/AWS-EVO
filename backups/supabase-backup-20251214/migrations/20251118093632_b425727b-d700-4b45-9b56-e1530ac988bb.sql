-- ============================================
-- CRITICAL: Add Missing RLS Policies
-- ============================================

-- 1. ri_sp_recommendations table RLS
ALTER TABLE public.ri_sp_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view RI/SP recommendations in their organization"
ON public.ri_sp_recommendations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.aws_credentials ac
    WHERE ac.id = ri_sp_recommendations.aws_account_id
    AND ac.organization_id = get_user_organization(auth.uid())
  )
);

CREATE POLICY "Service role can manage RI/SP recommendations"
ON public.ri_sp_recommendations
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 2. user_achievements table RLS
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own achievements"
ON public.user_achievements
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own achievements"
ON public.user_achievements
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage user achievements"
ON public.user_achievements
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 3. infrastructure_topology table - enhance existing RLS
DROP POLICY IF EXISTS "Allow public access to infrastructure_topology" ON public.infrastructure_topology;

CREATE POLICY "Users can view infrastructure topology in their organization"
ON public.infrastructure_topology
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.aws_credentials ac
    WHERE ac.id = infrastructure_topology.aws_account_id
    AND ac.organization_id = get_user_organization(auth.uid())
  )
);

CREATE POLICY "Service role can manage infrastructure topology"
ON public.infrastructure_topology
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 4. drift_detections table - enhance existing RLS
DROP POLICY IF EXISTS "Allow public access to drift_detections" ON public.drift_detections;

CREATE POLICY "Users can view drift detections in their organization"
ON public.drift_detections
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.aws_credentials ac
    WHERE ac.id = drift_detections.aws_account_id
    AND ac.organization_id = get_user_organization(auth.uid())
  )
);

CREATE POLICY "Service role can manage drift detections"
ON public.drift_detections
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 5. commitment_analysis table RLS
ALTER TABLE public.commitment_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view commitment analysis in their organization"
ON public.commitment_analysis
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.aws_credentials ac
    WHERE ac.id = commitment_analysis.aws_account_id
    AND ac.organization_id = get_user_organization(auth.uid())
  )
);

CREATE POLICY "Service role can manage commitment analysis"
ON public.commitment_analysis
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 6. rightsizing_recommendations table RLS
ALTER TABLE public.rightsizing_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rightsizing recommendations in their organization"
ON public.rightsizing_recommendations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.aws_credentials ac
    WHERE ac.id = rightsizing_recommendations.aws_account_id
    AND ac.organization_id = get_user_organization(auth.uid())
  )
);

CREATE POLICY "Service role can manage rightsizing recommendations"
ON public.rightsizing_recommendations
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 7. chargeback_reports table RLS
ALTER TABLE public.chargeback_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chargeback reports in their organization"
ON public.chargeback_reports
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.aws_credentials ac
    WHERE ac.id = chargeback_reports.aws_account_id
    AND ac.organization_id = get_user_organization(auth.uid())
  )
);

CREATE POLICY "Service role can manage chargeback reports"
ON public.chargeback_reports
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- PERFORMANCE: Add Missing Indexes
-- ============================================

-- drift_detections indexes
CREATE INDEX IF NOT EXISTS idx_drift_detections_aws_account 
ON public.drift_detections(aws_account_id);

CREATE INDEX IF NOT EXISTS idx_drift_detections_status 
ON public.drift_detections(status);

CREATE INDEX IF NOT EXISTS idx_drift_detections_detected_at 
ON public.drift_detections(detected_at DESC);

-- infrastructure_topology indexes
CREATE INDEX IF NOT EXISTS idx_infrastructure_topology_aws_account 
ON public.infrastructure_topology(aws_account_id);

CREATE INDEX IF NOT EXISTS idx_infrastructure_topology_resource_type 
ON public.infrastructure_topology(resource_type);

CREATE INDEX IF NOT EXISTS idx_infrastructure_topology_attack_surface 
ON public.infrastructure_topology(attack_surface_score DESC);

-- ri_sp_recommendations indexes
CREATE INDEX IF NOT EXISTS idx_ri_sp_recommendations_aws_account 
ON public.ri_sp_recommendations(aws_account_id);

CREATE INDEX IF NOT EXISTS idx_ri_sp_recommendations_status 
ON public.ri_sp_recommendations(status);

CREATE INDEX IF NOT EXISTS idx_ri_sp_recommendations_savings 
ON public.ri_sp_recommendations(yearly_savings DESC);

-- user_achievements indexes
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id 
ON public.user_achievements(user_id);

CREATE INDEX IF NOT EXISTS idx_user_achievements_earned_at 
ON public.user_achievements(earned_at DESC);

-- gamification_leaderboard indexes
CREATE INDEX IF NOT EXISTS idx_gamification_leaderboard_user_id 
ON public.gamification_leaderboard(user_id);

CREATE INDEX IF NOT EXISTS idx_gamification_leaderboard_period 
ON public.gamification_leaderboard(period);

CREATE INDEX IF NOT EXISTS idx_gamification_leaderboard_points 
ON public.gamification_leaderboard(total_points DESC);

-- iam_findings indexes
CREATE INDEX IF NOT EXISTS idx_iam_findings_scan_id 
ON public.iam_findings(scan_id);

CREATE INDEX IF NOT EXISTS idx_iam_findings_finding_type 
ON public.iam_findings(finding_type);

-- cost_anomalies indexes
CREATE INDEX IF NOT EXISTS idx_cost_anomalies_aws_account 
ON public.cost_anomalies(aws_account_id);

CREATE INDEX IF NOT EXISTS idx_cost_anomalies_detected_at 
ON public.cost_anomalies(detected_at DESC);

-- waste_detection indexes
CREATE INDEX IF NOT EXISTS idx_waste_detection_aws_account 
ON public.waste_detection(aws_account_id);

CREATE INDEX IF NOT EXISTS idx_waste_detection_status 
ON public.waste_detection(status);

-- findings indexes
CREATE INDEX IF NOT EXISTS idx_findings_organization_id 
ON public.findings(organization_id);

CREATE INDEX IF NOT EXISTS idx_findings_severity 
ON public.findings(severity);

CREATE INDEX IF NOT EXISTS idx_findings_status 
ON public.findings(status);

-- endpoint_monitor_results indexes
CREATE INDEX IF NOT EXISTS idx_endpoint_monitor_results_monitor_id 
ON public.endpoint_monitor_results(monitor_id);

CREATE INDEX IF NOT EXISTS idx_endpoint_monitor_results_checked_at 
ON public.endpoint_monitor_results(checked_at DESC);

-- Comment: All critical security policies and performance indexes added