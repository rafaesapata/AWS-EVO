-- Add unique constraint to prevent duplicate daily cost entries
ALTER TABLE public.daily_costs DROP CONSTRAINT IF EXISTS daily_costs_unique_entry;
ALTER TABLE public.daily_costs ADD CONSTRAINT daily_costs_unique_entry 
UNIQUE (aws_account_id, cost_date, organization_id);

-- Delete duplicate entries keeping only the most recent
DELETE FROM public.daily_costs a USING public.daily_costs b
WHERE a.id < b.id 
AND a.aws_account_id = b.aws_account_id 
AND a.cost_date = b.cost_date 
AND a.organization_id = b.organization_id;