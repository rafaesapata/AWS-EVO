-- Create table for cost optimization recommendations
CREATE TABLE IF NOT EXISTS public.cost_recommendations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recommendation_type text NOT NULL, -- 'underutilized', 'savings_plan', 'architecture', 'rightsizing'
  service text NOT NULL,
  resource_id text,
  current_cost_monthly numeric(10,2),
  projected_savings_monthly numeric(10,2),
  projected_savings_yearly numeric(10,2),
  savings_percentage numeric(5,2),
  title text NOT NULL,
  description text NOT NULL,
  implementation_steps text,
  ai_analysis text,
  priority text NOT NULL DEFAULT 'medium', -- 'critical', 'high', 'medium', 'low'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'implementing', 'completed', 'dismissed'
  implementation_difficulty text, -- 'easy', 'medium', 'hard'
  details jsonb,
  scan_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cost_recommendations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read access" ON public.cost_recommendations FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.cost_recommendations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.cost_recommendations FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON public.cost_recommendations FOR DELETE USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_cost_recommendations_updated_at
  BEFORE UPDATE ON public.cost_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cost_recommendations_type ON public.cost_recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_cost_recommendations_status ON public.cost_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_cost_recommendations_priority ON public.cost_recommendations(priority);
CREATE INDEX IF NOT EXISTS idx_cost_recommendations_scan_id ON public.cost_recommendations(scan_id);

-- Add cost analysis to security scans table
ALTER TABLE public.security_scans ADD COLUMN IF NOT EXISTS cost_recommendations_count integer DEFAULT 0;
ALTER TABLE public.security_scans ADD COLUMN IF NOT EXISTS total_projected_savings numeric(10,2);