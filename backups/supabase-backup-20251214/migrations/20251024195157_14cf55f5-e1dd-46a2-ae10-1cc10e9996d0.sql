-- Adicionar soft delete aos usuários
-- Adiciona coluna deleted_at para marcar usuários como deletados
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Adiciona coluna deleted_by para rastrear quem deletou
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) DEFAULT NULL;

-- Cria índice para melhorar performance de queries que filtram por deleted_at
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON public.profiles(deleted_at) WHERE deleted_at IS NULL;

-- Função para soft delete de usuários (apenas super admins)
CREATE OR REPLACE FUNCTION public.soft_delete_user(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  is_super_admin BOOLEAN;
  result JSONB;
BEGIN
  -- Pega o ID do usuário atual
  current_user_id := auth.uid();
  
  -- Verifica se o usuário atual é super admin
  is_super_admin := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = current_user_id 
    AND role = 'super_admin'::app_role
  );
  
  -- Se não for super admin, retorna erro
  IF NOT is_super_admin THEN
    RAISE EXCEPTION 'Only super admins can soft delete users';
  END IF;
  
  -- Não permite deletar a si mesmo
  IF current_user_id = target_user_id THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;
  
  -- Marca o usuário como deletado
  UPDATE public.profiles
  SET 
    deleted_at = NOW(),
    deleted_by = current_user_id,
    updated_at = NOW()
  WHERE id = target_user_id
  AND deleted_at IS NULL;
  
  -- Verifica se o update foi bem sucedido
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found or already deleted';
  END IF;
  
  -- Log da ação
  INSERT INTO public.audit_log (user_id, action, resource_type, resource_id, details)
  VALUES (
    current_user_id,
    'SOFT_DELETE_USER',
    'profile',
    target_user_id,
    jsonb_build_object(
      'deleted_user_id', target_user_id,
      'deleted_at', NOW()
    )
  );
  
  result := jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'deleted_at', NOW()
  );
  
  RETURN result;
END;
$$;

-- Função para restaurar usuário deletado (apenas super admins)
CREATE OR REPLACE FUNCTION public.restore_user(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  is_super_admin BOOLEAN;
  result JSONB;
BEGIN
  current_user_id := auth.uid();
  
  is_super_admin := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = current_user_id 
    AND role = 'super_admin'::app_role
  );
  
  IF NOT is_super_admin THEN
    RAISE EXCEPTION 'Only super admins can restore users';
  END IF;
  
  -- Restaura o usuário
  UPDATE public.profiles
  SET 
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW()
  WHERE id = target_user_id
  AND deleted_at IS NOT NULL;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found or not deleted';
  END IF;
  
  -- Log da ação
  INSERT INTO public.audit_log (user_id, action, resource_type, resource_id, details)
  VALUES (
    current_user_id,
    'RESTORE_USER',
    'profile',
    target_user_id,
    jsonb_build_object(
      'restored_user_id', target_user_id,
      'restored_at', NOW()
    )
  );
  
  result := jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'restored_at', NOW()
  );
  
  RETURN result;
END;
$$;

-- Atualiza RLS policy para filtrar usuários deletados por padrão
DROP POLICY IF EXISTS "Users can view profiles in their org" ON public.profiles;

CREATE POLICY "Users can view active profiles in their org"
ON public.profiles
FOR SELECT
USING (
  (
    organization_id = get_user_organization(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
  AND (
    deleted_at IS NULL 
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

COMMENT ON COLUMN public.profiles.deleted_at IS 'Timestamp when user was soft deleted. NULL means active user.';
COMMENT ON COLUMN public.profiles.deleted_by IS 'ID of the super admin who deleted this user.';
COMMENT ON FUNCTION public.soft_delete_user IS 'Soft deletes a user. Only super admins can call this function.';
COMMENT ON FUNCTION public.restore_user IS 'Restores a soft deleted user. Only super admins can call this function.';