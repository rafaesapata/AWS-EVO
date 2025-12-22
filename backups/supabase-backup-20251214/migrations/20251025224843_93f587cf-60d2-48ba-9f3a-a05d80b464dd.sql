-- Helper function to extract missing permissions from AWS error
CREATE OR REPLACE FUNCTION public.extract_missing_permissions(error_message TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
AS $$
DECLARE
  permissions TEXT[];
  permission TEXT;
BEGIN
  -- Extract permission from common AWS error patterns
  -- Pattern 1: "User: arn:... is not authorized to perform: ACTION on resource: ..."
  IF error_message ~ 'is not authorized to perform:' THEN
    permission := substring(error_message from 'is not authorized to perform: ([a-zA-Z0-9:*]+)');
    IF permission IS NOT NULL THEN
      permissions := ARRAY[permission];
    END IF;
  END IF;
  
  -- Pattern 2: "AccessDenied" with action
  IF error_message ~ 'AccessDenied.*Action:' THEN
    permission := substring(error_message from 'Action: ([a-zA-Z0-9:*]+)');
    IF permission IS NOT NULL THEN
      permissions := ARRAY[permission];
    END IF;
  END IF;
  
  RETURN COALESCE(permissions, ARRAY[]::TEXT[]);
END;
$$;

-- Function to log permission errors from edge functions
CREATE OR REPLACE FUNCTION public.log_permission_error(
  p_aws_account_id UUID,
  p_service TEXT,
  p_action TEXT,
  p_error_message TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;