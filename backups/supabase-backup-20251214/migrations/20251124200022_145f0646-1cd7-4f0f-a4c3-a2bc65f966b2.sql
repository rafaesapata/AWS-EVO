-- Fix handle_user_sign_in function - use id instead of user_id
CREATE OR REPLACE FUNCTION public.handle_user_sign_in()
RETURNS trigger
SECURITY DEFINER
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.profiles
  SET last_sign_in_at = now()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;