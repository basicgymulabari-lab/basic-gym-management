create or replace function public.get_current_gym_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_membership public.gym_users%rowtype;
  v_gym public.gyms%rowtype;
  v_workspace_revision bigint;
begin
  if v_user is null then
    return null;
  end if;

  select * into v_membership
  from public.gym_users
  where user_id = v_user
  limit 1;
  if not found then
    return null;
  end if;

  select * into v_gym from public.gyms where id = v_membership.gym_id;
  select revision into v_workspace_revision
  from public.gym_workspaces
  where gym_id = v_membership.gym_id;

  return jsonb_build_object(
    'gym_id', v_membership.gym_id,
    'role', v_membership.role,
    'permissions', coalesce(v_membership.permissions, '{}'::jsonb),
    'display_name', v_membership.display_name,
    'email', v_membership.email,
    'enabled', v_membership.enabled,
    'gym_name', v_gym.name,
    'workspace_revision', v_workspace_revision
  );
end;
$$;
