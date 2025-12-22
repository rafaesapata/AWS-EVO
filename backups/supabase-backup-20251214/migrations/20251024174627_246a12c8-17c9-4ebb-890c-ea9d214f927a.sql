-- Create budget_forecasts table to store AI-generated forecasts
CREATE TABLE IF NOT EXISTS public.budget_forecasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  aws_account_id UUID REFERENCES public.aws_credentials(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  forecast_months INTEGER NOT NULL DEFAULT 3,
  historical_days INTEGER NOT NULL DEFAULT 0,
  potential_monthly_savings NUMERIC DEFAULT 0,
  forecast_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  insights JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.budget_forecasts ENABLE ROW LEVEL SECURITY;

-- Create policies for budget_forecasts
CREATE POLICY "Users can view forecasts in their organization"
  ON public.budget_forecasts
  FOR SELECT
  USING (
    organization_id IS NULL OR 
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Users can insert forecasts"
  ON public.budget_forecasts
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update forecasts in their organization"
  ON public.budget_forecasts
  FOR UPDATE
  USING (
    organization_id IS NULL OR 
    organization_id = get_user_organization(auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Create index for faster queries
CREATE INDEX idx_budget_forecasts_org ON public.budget_forecasts(organization_id);
CREATE INDEX idx_budget_forecasts_generated_at ON public.budget_forecasts(generated_at DESC);