-- Create table for cost anomalies
CREATE TABLE public.cost_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id uuid REFERENCES public.aws_credentials(id),
  detected_at timestamp with time zone NOT NULL DEFAULT now(),
  service text NOT NULL,
  resource_id text,
  anomaly_type text NOT NULL, -- 'spike', 'unusual_pattern', 'new_service', 'region_change'
  severity text NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  baseline_cost numeric NOT NULL,
  current_cost numeric NOT NULL,
  deviation_percentage numeric NOT NULL,
  time_period jsonb NOT NULL, -- {start, end}
  details jsonb,
  status text NOT NULL DEFAULT 'active', -- 'active', 'investigating', 'resolved', 'false_positive'
  investigated_by text,
  resolution_notes text,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Create table for waste detection
CREATE TABLE public.waste_detection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id uuid REFERENCES public.aws_credentials(id),
  detected_at timestamp with time zone NOT NULL DEFAULT now(),
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  resource_name text,
  region text NOT NULL,
  waste_type text NOT NULL, -- 'idle', 'underutilized', 'orphaned', 'oversized', 'old_snapshot', 'unattached_volume'
  severity text NOT NULL DEFAULT 'medium',
  monthly_waste_cost numeric NOT NULL,
  yearly_waste_cost numeric NOT NULL,
  utilization_metrics jsonb, -- CPU, memory, network, etc
  recommendations text NOT NULL,
  auto_remediation_available boolean DEFAULT false,
  remediation_script text,
  status text NOT NULL DEFAULT 'active', -- 'active', 'scheduled', 'remediated', 'ignored'
  remediated_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Create table for security posture
CREATE TABLE public.security_posture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id uuid REFERENCES public.aws_credentials(id),
  calculated_at timestamp with time zone NOT NULL DEFAULT now(),
  overall_score numeric NOT NULL DEFAULT 0, -- 0-100
  identity_score numeric NOT NULL DEFAULT 0,
  network_score numeric NOT NULL DEFAULT 0,
  data_score numeric NOT NULL DEFAULT 0,
  compute_score numeric NOT NULL DEFAULT 0,
  monitoring_score numeric NOT NULL DEFAULT 0,
  total_findings integer DEFAULT 0,
  critical_findings integer DEFAULT 0,
  high_findings integer DEFAULT 0,
  medium_findings integer DEFAULT 0,
  low_findings integer DEFAULT 0,
  compliance_percentage numeric DEFAULT 0,
  trend text, -- 'improving', 'stable', 'degrading'
  previous_score numeric,
  score_change numeric,
  details jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Create table for resource inventory
CREATE TABLE public.resource_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id uuid REFERENCES public.aws_credentials(id),
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  resource_name text,
  resource_arn text,
  region text NOT NULL,
  service text NOT NULL,
  status text, -- 'running', 'stopped', 'available', etc
  tags jsonb DEFAULT '{}',
  monthly_cost numeric DEFAULT 0,
  last_modified timestamp with time zone,
  creation_date timestamp with time zone,
  metadata jsonb, -- Service-specific metadata
  compliance_status text, -- 'compliant', 'non_compliant', 'not_applicable'
  security_findings integer DEFAULT 0,
  cost_optimization_opportunities integer DEFAULT 0,
  last_scanned_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create table for customizable dashboards
CREATE TABLE public.custom_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  layout jsonb NOT NULL, -- Grid layout configuration
  widgets jsonb NOT NULL, -- Widget configurations
  filters jsonb, -- Global dashboard filters
  refresh_interval integer DEFAULT 300, -- seconds
  is_public boolean DEFAULT false,
  shared_with jsonb, -- Array of user IDs
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cost_anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_detection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_posture ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_dashboards ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow public access to cost_anomalies" ON public.cost_anomalies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to waste_detection" ON public.waste_detection FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to security_posture" ON public.security_posture FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to resource_inventory" ON public.resource_inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to custom_dashboards" ON public.custom_dashboards FOR ALL USING (true) WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_cost_anomalies_account ON public.cost_anomalies(aws_account_id);
CREATE INDEX idx_cost_anomalies_status ON public.cost_anomalies(status);
CREATE INDEX idx_cost_anomalies_severity ON public.cost_anomalies(severity);
CREATE INDEX idx_waste_detection_account ON public.waste_detection(aws_account_id);
CREATE INDEX idx_waste_detection_status ON public.waste_detection(status);
CREATE INDEX idx_waste_detection_type ON public.waste_detection(waste_type);
CREATE INDEX idx_security_posture_account ON public.security_posture(aws_account_id);
CREATE INDEX idx_resource_inventory_account ON public.resource_inventory(aws_account_id);
CREATE INDEX idx_resource_inventory_type ON public.resource_inventory(resource_type);
CREATE INDEX idx_resource_inventory_service ON public.resource_inventory(service);
CREATE INDEX idx_custom_dashboards_user ON public.custom_dashboards(user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_resource_inventory_updated_at BEFORE UPDATE ON public.resource_inventory
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_custom_dashboards_updated_at BEFORE UPDATE ON public.custom_dashboards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();