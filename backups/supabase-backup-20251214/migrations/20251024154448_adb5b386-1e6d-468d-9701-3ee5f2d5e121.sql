-- Add ignore_reason column to cost_recommendations table
ALTER TABLE public.cost_recommendations 
ADD COLUMN IF NOT EXISTS ignore_reason text;

-- Add check_id column to well_architected_scores for tracking failed checks
ALTER TABLE public.well_architected_scores 
ADD COLUMN IF NOT EXISTS failed_checks jsonb DEFAULT '[]'::jsonb;