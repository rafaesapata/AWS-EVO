-- Create table for cost allocation tags
CREATE TABLE public.cost_allocation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id uuid REFERENCES public.aws_credentials(id),
  tag_key text NOT NULL,
  tag_value text NOT NULL,
  resource_count integer DEFAULT 0,
  monthly_cost numeric DEFAULT 0,
  yearly_cost numeric DEFAULT 0,
  department text,
  project text,
  environment text,
  cost_center text,
  owner text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create table for chargeback reports
CREATE TABLE public.chargeback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id uuid REFERENCES public.aws_credentials(id),
  report_period text NOT NULL, -- 'YYYY-MM'
  department text,
  project text,
  environment text,
  cost_center text,
  total_cost numeric NOT NULL,
  compute_cost numeric DEFAULT 0,
  storage_cost numeric DEFAULT 0,
  network_cost numeric DEFAULT 0,
  database_cost numeric DEFAULT 0,
  other_cost numeric DEFAULT 0,
  resource_breakdown jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Create table for rightsizing recommendations v2
CREATE TABLE public.rightsizing_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id uuid REFERENCES public.aws_credentials(id),
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  resource_name text,
  region text NOT NULL,
  current_instance_type text NOT NULL,
  recommended_instance_type text NOT NULL,
  current_monthly_cost numeric NOT NULL,
  recommended_monthly_cost numeric NOT NULL,
  monthly_savings numeric NOT NULL,
  yearly_savings numeric NOT NULL,
  savings_percentage numeric NOT NULL,
  analysis_period_days integer DEFAULT 90,
  avg_cpu_utilization numeric,
  max_cpu_utilization numeric,
  avg_memory_utilization numeric,
  max_memory_utilization numeric,
  avg_network_in numeric,
  avg_network_out numeric,
  seasonal_pattern jsonb, -- {high_season: [], low_season: []}
  confidence_score numeric DEFAULT 0, -- 0-100
  recommendation_type text NOT NULL, -- 'downsize', 'upsize', 'change_family', 'graviton', 'spot'
  graviton_compatible boolean DEFAULT false,
  spot_compatible boolean DEFAULT false,
  implementation_complexity text DEFAULT 'low', -- 'low', 'medium', 'high'
  status text DEFAULT 'pending',
  created_at timestamp with time zone DEFAULT now()
);

-- Create table for commitment optimizer
CREATE TABLE public.commitment_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id uuid REFERENCES public.aws_credentials(id),
  analysis_date timestamp with time zone DEFAULT now(),
  total_monthly_cost numeric NOT NULL,
  on_demand_cost numeric NOT NULL,
  savings_plans_cost numeric DEFAULT 0,
  reserved_instances_cost numeric DEFAULT 0,
  current_commitment_percentage numeric DEFAULT 0,
  recommended_sp_commitment numeric,
  recommended_ri_commitment numeric,
  recommended_commitment_percentage numeric,
  projected_monthly_savings numeric,
  projected_yearly_savings numeric,
  payback_period_months numeric,
  commitment_recommendations jsonb NOT NULL, -- [{type, term, payment, coverage, savings}]
  service_breakdown jsonb, -- {EC2, RDS, Lambda, etc}
  risk_assessment text, -- 'low', 'medium', 'high'
  implementation_plan text,
  created_at timestamp with time zone DEFAULT now()
);

-- Create table for saved filters
CREATE TABLE public.saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  description text,
  filter_type text NOT NULL, -- 'findings', 'recommendations', 'resources', 'costs'
  filter_config jsonb NOT NULL,
  is_public boolean DEFAULT false,
  shared_with jsonb, -- Array of user IDs
  usage_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cost_allocation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chargeback_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rightsizing_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commitment_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow public access to cost_allocation_tags" ON public.cost_allocation_tags FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to chargeback_reports" ON public.chargeback_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to rightsizing_recommendations" ON public.rightsizing_recommendations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to commitment_analysis" ON public.commitment_analysis FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to saved_filters" ON public.saved_filters FOR ALL USING (true) WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_cost_allocation_tags_account ON public.cost_allocation_tags(aws_account_id);
CREATE INDEX idx_cost_allocation_tags_key ON public.cost_allocation_tags(tag_key);
CREATE INDEX idx_cost_allocation_tags_dept ON public.cost_allocation_tags(department);
CREATE INDEX idx_chargeback_reports_account ON public.chargeback_reports(aws_account_id);
CREATE INDEX idx_chargeback_reports_period ON public.chargeback_reports(report_period);
CREATE INDEX idx_rightsizing_account ON public.rightsizing_recommendations(aws_account_id);
CREATE INDEX idx_rightsizing_type ON public.rightsizing_recommendations(recommendation_type);
CREATE INDEX idx_commitment_account ON public.commitment_analysis(aws_account_id);
CREATE INDEX idx_saved_filters_user ON public.saved_filters(user_id);
CREATE INDEX idx_saved_filters_type ON public.saved_filters(filter_type);

-- Create triggers
CREATE TRIGGER update_cost_allocation_tags_updated_at BEFORE UPDATE ON public.cost_allocation_tags
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_saved_filters_updated_at BEFORE UPDATE ON public.saved_filters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();