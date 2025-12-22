-- =====================================================
-- BACKGROUND JOB QUEUE SYSTEM
-- =====================================================

-- Job queue table
CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,
    job_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'retrying')),
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    organization_id UUID REFERENCES organizations(id),
    payload JSONB NOT NULL,
    result JSONB,
    error_message TEXT,
    error_stack TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    timeout_seconds INTEGER DEFAULT 300,
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for job queue
CREATE INDEX idx_background_jobs_status_priority ON background_jobs (status, priority DESC, scheduled_for) WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_background_jobs_org_status ON background_jobs (organization_id, status, created_at DESC);
CREATE INDEX idx_background_jobs_type_status ON background_jobs (job_type, status);

-- Job logs table for detailed tracking
CREATE TABLE IF NOT EXISTS job_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES background_jobs(id) ON DELETE CASCADE,
    log_level TEXT NOT NULL CHECK (log_level IN ('debug', 'info', 'warn', 'error')),
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_job_logs_job_id_created ON job_logs (job_id, created_at DESC);

-- Function to enqueue jobs
CREATE OR REPLACE FUNCTION enqueue_background_job(
    p_job_type TEXT,
    p_job_name TEXT,
    p_payload JSONB,
    p_organization_id UUID DEFAULT NULL,
    p_priority INTEGER DEFAULT 5,
    p_scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    p_max_retries INTEGER DEFAULT 3
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job_id UUID;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    INSERT INTO background_jobs (
        job_type,
        job_name,
        payload,
        organization_id,
        priority,
        scheduled_for,
        max_retries,
        created_by
    ) VALUES (
        p_job_type,
        p_job_name,
        p_payload,
        p_organization_id,
        p_priority,
        p_scheduled_for,
        p_max_retries,
        v_user_id
    ) RETURNING id INTO v_job_id;
    
    -- Log job creation
    INSERT INTO job_logs (job_id, log_level, message, metadata)
    VALUES (v_job_id, 'info', 'Job enqueued', jsonb_build_object('priority', p_priority, 'scheduled_for', p_scheduled_for));
    
    RETURN v_job_id;
END;
$$;

-- Function to log job progress
CREATE OR REPLACE FUNCTION log_job_progress(
    p_job_id UUID,
    p_level TEXT,
    p_message TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO job_logs (job_id, log_level, message, metadata)
    VALUES (p_job_id, p_level, p_message, p_metadata)
    RETURNING id INTO v_log_id;
    
    -- Update job timestamp
    UPDATE background_jobs SET updated_at = NOW() WHERE id = p_job_id;
    
    RETURN v_log_id;
END;
$$;

-- Function to claim next job
CREATE OR REPLACE FUNCTION claim_next_job(
    p_job_types TEXT[] DEFAULT NULL,
    p_worker_id TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job_id UUID;
BEGIN
    -- Find and claim the next available job
    SELECT id INTO v_job_id
    FROM background_jobs
    WHERE status IN ('pending', 'retrying')
        AND scheduled_for <= NOW()
        AND (p_job_types IS NULL OR job_type = ANY(p_job_types))
    ORDER BY priority DESC, scheduled_for
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
    
    IF v_job_id IS NOT NULL THEN
        UPDATE background_jobs
        SET status = 'processing',
            started_at = NOW(),
            updated_at = NOW()
        WHERE id = v_job_id;
        
        INSERT INTO job_logs (job_id, log_level, message, metadata)
        VALUES (v_job_id, 'info', 'Job claimed by worker', jsonb_build_object('worker_id', p_worker_id));
    END IF;
    
    RETURN v_job_id;
END;
$$;

-- =====================================================
-- ANOMALY DETECTION SYSTEM
-- =====================================================

-- Anomaly detection results table
CREATE TABLE IF NOT EXISTS anomaly_detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    detection_type TEXT NOT NULL CHECK (detection_type IN ('cost', 'usage', 'performance', 'security', 'multi_dimensional')),
    resource_type TEXT,
    resource_id TEXT,
    anomaly_score NUMERIC NOT NULL CHECK (anomaly_score BETWEEN 0 AND 1),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    dimensions JSONB NOT NULL,
    baseline_metrics JSONB,
    current_metrics JSONB,
    deviation_percentage NUMERIC,
    confidence_level NUMERIC CHECK (confidence_level BETWEEN 0 AND 1),
    detection_method TEXT NOT NULL,
    features_analyzed TEXT[],
    recommendations TEXT[],
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'investigating', 'resolved', 'false_positive')),
    acknowledged_by UUID,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for anomaly detection
CREATE INDEX idx_anomaly_detections_org_severity ON anomaly_detections (organization_id, severity, detected_at DESC);
CREATE INDEX idx_anomaly_detections_type_status ON anomaly_detections (detection_type, status);
CREATE INDEX idx_anomaly_detections_score ON anomaly_detections (anomaly_score DESC, detected_at DESC);
CREATE INDEX idx_anomaly_detections_resource ON anomaly_detections (resource_type, resource_id);

-- Anomaly detection configuration
CREATE TABLE IF NOT EXISTS anomaly_detection_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    detection_type TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    sensitivity NUMERIC DEFAULT 0.7 CHECK (sensitivity BETWEEN 0 AND 1),
    threshold_multiplier NUMERIC DEFAULT 2.0,
    lookback_days INTEGER DEFAULT 30,
    min_samples INTEGER DEFAULT 100,
    features_config JSONB DEFAULT '{}'::jsonb,
    notification_channels JSONB DEFAULT '["email"]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, detection_type)
);

-- Function to calculate anomaly baseline
CREATE OR REPLACE FUNCTION calculate_anomaly_baseline(
    p_organization_id UUID,
    p_metric_type TEXT,
    p_lookback_days INTEGER DEFAULT 30
) RETURNS TABLE (
    mean_value NUMERIC,
    std_dev NUMERIC,
    median_value NUMERIC,
    p95_value NUMERIC,
    p99_value NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH recent_data AS (
        SELECT total_cost as value
        FROM daily_costs
        WHERE organization_id = p_organization_id
            AND cost_date >= CURRENT_DATE - p_lookback_days
            AND total_cost IS NOT NULL
    )
    SELECT 
        AVG(value) as mean_value,
        STDDEV(value) as std_dev,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) as median_value,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95_value,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value) as p99_value
    FROM recent_data;
END;
$$;

-- RLS Policies
ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_detection_config ENABLE ROW LEVEL SECURITY;

-- Background jobs policies
CREATE POLICY "Super admins can view all jobs"
ON background_jobs FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can view jobs in their org"
ON background_jobs FOR SELECT
USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "System can manage jobs"
ON background_jobs FOR ALL
USING (true)
WITH CHECK (true);

-- Job logs policies
CREATE POLICY "Users can view logs for their org jobs"
ON job_logs FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM background_jobs
        WHERE background_jobs.id = job_logs.job_id
            AND (
                background_jobs.organization_id = get_user_organization(auth.uid())
                OR has_role(auth.uid(), 'super_admin'::app_role)
            )
    )
);

CREATE POLICY "System can insert logs"
ON job_logs FOR INSERT
WITH CHECK (true);

-- Anomaly detection policies
CREATE POLICY "Users can view anomalies in their org"
ON anomaly_detections FOR SELECT
USING (organization_id = get_user_organization(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can update anomalies in their org"
ON anomaly_detections FOR UPDATE
USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "System can insert anomalies"
ON anomaly_detections FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can manage anomaly config in their org"
ON anomaly_detection_config FOR ALL
USING (organization_id = get_user_organization(auth.uid()));