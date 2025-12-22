-- Create table for wizard progress persistence
CREATE TABLE IF NOT EXISTS public.wizard_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wizard_type TEXT NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 0,
  data JSONB DEFAULT '{}'::jsonb,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, wizard_type)
);

-- Enable RLS
ALTER TABLE public.wizard_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own wizard progress"
ON public.wizard_progress FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wizard progress"
ON public.wizard_progress FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wizard progress"
ON public.wizard_progress FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wizard progress"
ON public.wizard_progress FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_wizard_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_wizard_progress_updated_at_trigger
BEFORE UPDATE ON public.wizard_progress
FOR EACH ROW
EXECUTE FUNCTION update_wizard_progress_updated_at();

-- Create index for performance
CREATE INDEX idx_wizard_progress_user_type ON public.wizard_progress(user_id, wizard_type);