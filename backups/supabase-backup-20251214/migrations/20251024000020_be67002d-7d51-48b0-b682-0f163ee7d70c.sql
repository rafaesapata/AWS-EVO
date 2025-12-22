-- Create table for predictive incidents
CREATE TABLE public.predictive_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id uuid REFERENCES public.aws_credentials(id),
  predicted_at timestamp with time zone DEFAULT now(),
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  resource_name text,
  region text NOT NULL,
  incident_type text NOT NULL, -- 'failure', 'performance_degradation', 'capacity_issue', 'security_breach'
  severity text NOT NULL DEFAULT 'medium',
  probability numeric NOT NULL, -- 0-100
  time_to_incident_hours numeric NOT NULL,
  confidence_score numeric NOT NULL, -- 0-100
  contributing_factors jsonb, -- [{factor, weight, value}]
  historical_patterns jsonb,
  recommended_actions text NOT NULL,
  auto_remediation_available boolean DEFAULT false,
  remediation_script text,
  status text DEFAULT 'predicted', -- 'predicted', 'confirmed', 'prevented', 'false_positive'
  confirmed_at timestamp with time zone,
  prevented_at timestamp with time zone,
  actual_incident_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Create table for agent actions (for FinOps Copilot v2)
CREATE TABLE public.agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  user_id uuid,
  action_type text NOT NULL, -- 'cost_optimization', 'security_fix', 'resource_cleanup', 'terraform_deploy'
  action_description text NOT NULL,
  target_resources jsonb, -- [{resource_id, resource_type}]
  estimated_impact jsonb, -- {cost_savings, risk_reduction, etc}
  approval_status text DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'executed', 'failed'
  approved_by uuid,
  approved_at timestamp with time zone,
  executed_at timestamp with time zone,
  execution_result jsonb,
  error_message text,
  rollback_available boolean DEFAULT false,
  rollback_script text,
  created_at timestamp with time zone DEFAULT now()
);

-- Create table for ML models metadata
CREATE TABLE public.ml_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name text NOT NULL,
  model_type text NOT NULL, -- 'incident_prediction', 'cost_forecasting', 'anomaly_detection'
  version text NOT NULL,
  accuracy numeric,
  precision_score numeric,
  recall_score numeric,
  f1_score numeric,
  training_date timestamp with time zone,
  last_updated timestamp with time zone DEFAULT now(),
  model_config jsonb,
  feature_importance jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.predictive_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_models ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow public access to predictive_incidents" ON public.predictive_incidents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to agent_actions" ON public.agent_actions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to ml_models" ON public.ml_models FOR ALL USING (true) WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_predictive_incidents_account ON public.predictive_incidents(aws_account_id);
CREATE INDEX idx_predictive_incidents_status ON public.predictive_incidents(status);
CREATE INDEX idx_predictive_incidents_type ON public.predictive_incidents(incident_type);
CREATE INDEX idx_agent_actions_conversation ON public.agent_actions(conversation_id);
CREATE INDEX idx_agent_actions_status ON public.agent_actions(approval_status);
CREATE INDEX idx_ml_models_type ON public.ml_models(model_type);
CREATE INDEX idx_ml_models_active ON public.ml_models(is_active);