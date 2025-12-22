-- Peer Benchmarking Tables
CREATE TABLE public.peer_benchmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  industry_sector TEXT NOT NULL,
  company_size TEXT NOT NULL, -- small, medium, large, enterprise
  anonymized_org_id TEXT NOT NULL, -- hashed organization ID
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  avg_security_score NUMERIC,
  avg_cost_efficiency NUMERIC,
  avg_well_architected_score NUMERIC,
  total_monthly_spend NUMERIC,
  resources_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_peer_benchmarks_sector ON public.peer_benchmarks(industry_sector);
CREATE INDEX idx_peer_benchmarks_size ON public.peer_benchmarks(company_size);

-- Drift Detection Tables
CREATE TABLE public.drift_detections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  aws_account_id UUID REFERENCES public.aws_credentials(id),
  resource_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_name TEXT,
  drift_type TEXT NOT NULL, -- manual_change, configuration_drift, deleted, created
  severity TEXT NOT NULL DEFAULT 'medium',
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expected_state JSONB,
  actual_state JSONB,
  diff JSONB,
  iac_source TEXT, -- terraform, cloudformation, cdk, manual
  iac_file_path TEXT,
  status TEXT DEFAULT 'open', -- open, acknowledged, resolved, ignored
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_drift_detections_account ON public.drift_detections(aws_account_id);
CREATE INDEX idx_drift_detections_status ON public.drift_detections(status);

-- RI/SP Optimizer Tables
CREATE TABLE public.ri_sp_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  aws_account_id UUID REFERENCES public.aws_credentials(id),
  recommendation_type TEXT NOT NULL, -- reserved_instance, savings_plan
  service TEXT NOT NULL,
  instance_family TEXT,
  region TEXT NOT NULL,
  term_length TEXT NOT NULL, -- 1year, 3year
  payment_option TEXT NOT NULL, -- all_upfront, partial_upfront, no_upfront
  current_on_demand_cost NUMERIC NOT NULL,
  recommended_commitment_cost NUMERIC NOT NULL,
  monthly_savings NUMERIC NOT NULL,
  yearly_savings NUMERIC NOT NULL,
  break_even_months NUMERIC,
  coverage_percentage NUMERIC,
  utilization_forecast JSONB, -- ML prediction data
  confidence_score NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_ri_sp_account ON public.ri_sp_recommendations(aws_account_id);

-- Infrastructure Topology Tables
CREATE TABLE public.infrastructure_topology (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  aws_account_id UUID REFERENCES public.aws_credentials(id),
  resource_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_name TEXT,
  region TEXT,
  connections JSONB, -- array of connected resource IDs
  security_groups JSONB,
  attack_surface_score NUMERIC DEFAULT 0,
  publicly_accessible BOOLEAN DEFAULT false,
  position JSONB, -- {x, y, z} for 3D visualization
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_topology_account ON public.infrastructure_topology(aws_account_id);
CREATE INDEX idx_topology_resource ON public.infrastructure_topology(resource_id);

-- Enable RLS
ALTER TABLE public.peer_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drift_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ri_sp_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.infrastructure_topology ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow public access to peer_benchmarks" 
ON public.peer_benchmarks FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access to drift_detections" 
ON public.drift_detections FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access to ri_sp_recommendations" 
ON public.ri_sp_recommendations FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access to infrastructure_topology" 
ON public.infrastructure_topology FOR ALL USING (true) WITH CHECK (true);