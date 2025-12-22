-- Create table for daily cost tracking
CREATE TABLE IF NOT EXISTS public.daily_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id UUID REFERENCES public.aws_credentials(id),
  cost_date DATE NOT NULL,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  service_breakdown JSONB DEFAULT '{}',
  cost_by_region JSONB DEFAULT '{}',
  forecasted_month_end NUMERIC(12,2),
  compared_to_yesterday NUMERIC(12,2),
  compared_to_last_week NUMERIC(12,2),
  organization_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(aws_account_id, cost_date, organization_id)
);

-- Enable RLS
ALTER TABLE public.daily_costs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view costs in their organization"
  ON public.daily_costs
  FOR SELECT
  USING (
    organization_id IS NULL OR 
    organization_id = public.get_user_organization(auth.uid()) OR
    public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Users can insert costs"
  ON public.daily_costs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update costs in their organization"
  ON public.daily_costs
  FOR UPDATE
  USING (
    organization_id IS NULL OR 
    organization_id = public.get_user_organization(auth.uid()) OR
    public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Add trigger for audit
CREATE TRIGGER audit_daily_costs_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.daily_costs
  FOR EACH ROW EXECUTE FUNCTION public.audit_table_changes();

-- Add trigger for updated_at
CREATE TRIGGER update_daily_costs_updated_at
  BEFORE UPDATE ON public.daily_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Create index for faster queries
CREATE INDEX idx_daily_costs_date ON public.daily_costs(cost_date DESC);
CREATE INDEX idx_daily_costs_account ON public.daily_costs(aws_account_id);
CREATE INDEX idx_daily_costs_org ON public.daily_costs(organization_id);