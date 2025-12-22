-- Secure RPCs for impersonation to bypass RLS safely
create or replace function public.start_impersonation(p_target_org_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Ensure only super admins can impersonate
  if not public.has_role(v_user_id, 'super_admin'::app_role) then
    raise exception 'Only super admins can impersonate';
  end if;

  -- End any existing active impersonation
  update public.impersonation_log
  set ended_at = now()
  where super_admin_id = v_user_id and ended_at is null;

  -- Start new impersonation
  insert into public.impersonation_log (super_admin_id, target_organization_id)
  values (v_user_id, p_target_org_id);
end;
$$;

create or replace function public.stop_impersonation()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.impersonation_log
  set ended_at = now()
  where super_admin_id = v_user_id and ended_at is null;
end;
$$;