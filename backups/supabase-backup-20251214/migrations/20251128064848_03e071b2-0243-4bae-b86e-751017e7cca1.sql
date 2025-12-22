-- ==============================================
-- CORREÇÃO FINAL - 4 Funções com search_path Mutável
-- ==============================================

-- 1. Corrigir calculate_waste_priority_score (versão com 3 parâmetros)
CREATE OR REPLACE FUNCTION public.calculate_waste_priority_score(
  yearly_cost numeric, 
  severity text, 
  can_auto_remediate boolean
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
AS $function$
BEGIN
  RETURN CASE
    WHEN yearly_cost > 10000 THEN 90
    WHEN yearly_cost > 5000 THEN 75
    WHEN yearly_cost > 1000 THEN 60
    ELSE 40
  END + 
  CASE severity
    WHEN 'critical' THEN 20
    WHEN 'high' THEN 15
    WHEN 'medium' THEN 10
    ELSE 5
  END +
  CASE WHEN can_auto_remediate THEN 10 ELSE 0 END;
END;
$function$;

-- 2. Corrigir create_notification
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid, 
  p_type text, 
  p_title text, 
  p_message text, 
  p_severity text DEFAULT NULL::text, 
  p_resource_id uuid DEFAULT NULL::uuid, 
  p_resource_type text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_notification_id uuid;
BEGIN
  INSERT INTO public.notifications (
    user_id, type, title, message, severity, 
    related_resource_id, related_resource_type
  )
  VALUES (
    p_user_id, p_type, p_title, p_message, p_severity,
    p_resource_id, p_resource_type
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$function$;

-- 3. Corrigir log_audit_action
CREATE OR REPLACE FUNCTION public.log_audit_action(
  p_user_id uuid, 
  p_action text, 
  p_resource_type text, 
  p_resource_id uuid DEFAULT NULL::uuid, 
  p_details jsonb DEFAULT NULL::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.audit_log (user_id, action, resource_type, resource_id, details)
  VALUES (p_user_id, p_action, p_resource_type, p_resource_id, p_details)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$function$;

-- 4. Corrigir log_permission_error
CREATE OR REPLACE FUNCTION public.log_permission_error(
  p_aws_account_id uuid, 
  p_service text, 
  p_action text, 
  p_error_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_missing_perms TEXT[];
  v_current_status RECORD;
BEGIN
  -- Extract missing permissions from error
  v_missing_perms := extract_missing_permissions(p_error_message);
  
  -- If we extracted a permission, add it to the format service:action
  IF array_length(v_missing_perms, 1) IS NULL AND p_service IS NOT NULL AND p_action IS NOT NULL THEN
    v_missing_perms := ARRAY[p_service || ':' || p_action];
  END IF;
  
  -- Get current validation status
  SELECT * INTO v_current_status
  FROM public.aws_validation_status
  WHERE aws_account_id = p_aws_account_id;
  
  IF v_current_status IS NOT NULL THEN
    -- Update existing record, merging missing permissions
    UPDATE public.aws_validation_status
    SET 
      missing_permissions = (
        SELECT array_agg(DISTINCT perm)
        FROM unnest(
          COALESCE(v_current_status.missing_permissions::TEXT[], ARRAY[]::TEXT[]) || 
          COALESCE(v_missing_perms, ARRAY[]::TEXT[])
        ) AS perm
      ),
      has_all_permissions = false,
      validation_error = p_error_message,
      last_validated_at = now(),
      updated_at = now()
    WHERE aws_account_id = p_aws_account_id;
  ELSE
    -- Insert new record
    INSERT INTO public.aws_validation_status (
      aws_account_id,
      is_connected,
      has_all_permissions,
      missing_permissions,
      validation_error,
      last_validated_at
    ) VALUES (
      p_aws_account_id,
      true, -- Connected but missing permissions
      false,
      v_missing_perms,
      p_error_message,
      now()
    );
  END IF;
END;
$function$;