-- Remove duplicates from daily_costs table keeping only the most recent record for each date
DELETE FROM public.daily_costs a
USING public.daily_costs b
WHERE a.id < b.id
  AND a.cost_date = b.cost_date
  AND a.aws_account_id = b.aws_account_id;

-- Create unique constraint to prevent future duplicates
ALTER TABLE public.daily_costs 
DROP CONSTRAINT IF EXISTS daily_costs_unique_date_account;

ALTER TABLE public.daily_costs 
ADD CONSTRAINT daily_costs_unique_date_account 
UNIQUE (aws_account_id, cost_date);