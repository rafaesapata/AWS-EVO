-- Add credits tracking to daily_costs
ALTER TABLE public.daily_costs 
ADD COLUMN IF NOT EXISTS credits_used numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_cost numeric GENERATED ALWAYS AS (total_cost - COALESCE(credits_used, 0)) STORED;

-- Add comments to remediation_tickets
ALTER TABLE public.remediation_tickets
ADD COLUMN IF NOT EXISTS comments jsonb DEFAULT '[]'::jsonb;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_daily_costs_credits ON public.daily_costs(credits_used) WHERE credits_used > 0;