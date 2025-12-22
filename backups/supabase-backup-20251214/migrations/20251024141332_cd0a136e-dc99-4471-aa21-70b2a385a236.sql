-- Make user_id nullable in audit_log to support system operations
ALTER TABLE public.audit_log ALTER COLUMN user_id DROP NOT NULL;

-- Update the audit trigger function to handle null user_id (system operations)
CREATE OR REPLACE FUNCTION public.audit_table_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Track INSERT
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.audit_log (user_id, action, resource_type, resource_id, details)
    VALUES (
      auth.uid(), -- Can be null for system operations
      'INSERT',
      TG_TABLE_NAME,
      NEW.id,
      jsonb_build_object('new_data', to_jsonb(NEW))
    );
    RETURN NEW;
  
  -- Track UPDATE
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.audit_log (user_id, action, resource_type, resource_id, details)
    VALUES (
      auth.uid(), -- Can be null for system operations
      'UPDATE',
      TG_TABLE_NAME,
      NEW.id,
      jsonb_build_object('old_data', to_jsonb(OLD), 'new_data', to_jsonb(NEW))
    );
    RETURN NEW;
  
  -- Track DELETE
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.audit_log (user_id, action, resource_type, resource_id, details)
    VALUES (
      auth.uid(), -- Can be null for system operations
      'DELETE',
      TG_TABLE_NAME,
      OLD.id,
      jsonb_build_object('old_data', to_jsonb(OLD))
    );
    RETURN OLD;
  END IF;
END;
$function$;