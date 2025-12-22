-- Add onboarding preferences to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS show_onboarding BOOLEAN DEFAULT true;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_show_onboarding ON public.profiles(show_onboarding);