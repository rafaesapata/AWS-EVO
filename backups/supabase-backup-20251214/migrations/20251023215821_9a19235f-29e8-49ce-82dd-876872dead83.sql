-- Add region comparison fields to cost recommendations
ALTER TABLE public.cost_recommendations ADD COLUMN IF NOT EXISTS current_region text;
ALTER TABLE public.cost_recommendations ADD COLUMN IF NOT EXISTS suggested_region text;
ALTER TABLE public.cost_recommendations ADD COLUMN IF NOT EXISTS region_price_difference numeric(10,2);

-- Create index for region queries
CREATE INDEX IF NOT EXISTS idx_cost_recommendations_region ON public.cost_recommendations(current_region, suggested_region);