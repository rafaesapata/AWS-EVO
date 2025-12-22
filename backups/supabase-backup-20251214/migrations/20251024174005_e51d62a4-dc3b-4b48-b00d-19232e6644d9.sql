-- Add last_sign_in_at column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN last_sign_in_at timestamp with time zone;

-- Create function to update last sign in timestamp
CREATE OR REPLACE FUNCTION public.handle_user_sign_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET last_sign_in_at = NEW.last_sign_in_at
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$;

-- Create trigger to update last_sign_in_at on auth.users updates
DROP TRIGGER IF EXISTS on_auth_user_sign_in ON auth.users;
CREATE TRIGGER on_auth_user_sign_in
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
  EXECUTE FUNCTION public.handle_user_sign_in();