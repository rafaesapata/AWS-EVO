-- Add confidence_score column to waste_detection table
ALTER TABLE public.waste_detection 
ADD COLUMN confidence_score numeric DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100);