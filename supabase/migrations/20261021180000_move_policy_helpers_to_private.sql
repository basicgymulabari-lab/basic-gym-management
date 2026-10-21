-- Move policy-only SECURITY DEFINER helpers out of the exposed Data API schema.
-- No public RPC wrappers are created. RLS and Storage policies retain the same
-- function OIDs, while the two function bodies and recharge RPC are updated to
-- call the helpers from private. No table or user data is changed.
--
-- This migration assumes the Data API continues to expose only public and
-- extensions. Keep private out of the Data API exposed-schema list.
do $migration$
declare
  v_targets oid[] := array[
    'public.iv_can_access_private_object(text)'::regprocedure::oid,
    'public.iv_can_manage_member_attendance()'::regprocedure::oid,
    'public.iv_can_read_platform_release_object(text)'::regprocedure::oid,
    'public.iv_can_write_private_object(text)'::regprocedure::oid,
    'public.iv_current_gym_id()'::regprocedure::oid,
    'public.iv_is_current_gym_owner()'::regprocedure::oid
  ];
  v_count integer;
begin
  if to_regnamespace('private') is not null then
    raise exception 'Schema private already exists; inspect it before applying this migration. No changes applied.';
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.oid = any(v_targets)
    and n.nspname = 'public'
    and p.prokind = 'f'
    and p.prosecdef
    and pg_get_userbyid(p.proowner) = 'postgres'
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and not has_function_privilege('anon', p.oid, 'EXECUTE')
    and not has_function_privilege('service_role', p.oid, 'EXECUTE');

  if v_count <> 6 then
    raise exception 'Expected exactly six authenticated-only, postgres-owned SECURITY DEFINER policy helpers; verified %. No changes applied.', v_count;
  end if;

  create schema private authorization postgres;
  revoke all on schema private from public, anon, authenticated, service_role;
  grant usage on schema private to authenticated;

  alter function public.iv_can_access_private_object(text) set schema private;
  alter function public.iv_can_manage_member_attendance() set schema private;
  alter function public.iv_can_read_platform_release_object(text) set schema private;
  alter function public.iv_can_write_private_object(text) set schema private;
  alter function public.iv_current_gym_id() set schema private;
  alter function public.iv_is_current_gym_owner() set schema private;

  revoke all on function private.iv_can_access_private_object(text) from public, anon, service_role;
  revoke all on function private.iv_can_manage_member_attendance() from public, anon, service_role;
  revoke all on function private.iv_can_read_platform_release_object(text) from public, anon, service_role;
  revoke all on function private.iv_can_write_private_object(text) from public, anon, service_role;
  revoke all on function private.iv_current_gym_id() from public, anon, service_role;
  revoke all on function private.iv_is_current_gym_owner() from public, anon, service_role;

  grant execute on function private.iv_can_access_private_object(text) to authenticated;
  grant execute on function private.iv_can_manage_member_attendance() to authenticated;
  grant execute on function private.iv_can_read_platform_release_object(text) to authenticated;
  grant execute on function private.iv_can_write_private_object(text) to authenticated;
  grant execute on function private.iv_current_gym_id() to authenticated;
  grant execute on function private.iv_is_current_gym_owner() to authenticated;
end;
$migration$;

-- Keep helper-to-helper calls working after moving the OIDs.
create or replace function private.iv_is_current_gym_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.gym_users membership
    where membership.user_id = auth.uid()
      and membership.gym_id = private.iv_current_gym_id()
      and membership.role = 'owner'
      and membership.enabled
  )
$$;

create or replace function private.iv_can_manage_member_attendance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.gym_users membership
    where membership.user_id = auth.uid()
      and membership.gym_id = private.iv_current_gym_id()
      and membership.enabled
      and (
        membership.role = 'owner'
        or (
          membership.role = 'receptionist'
          and public.iv_has_permission(membership.permissions, 'members')
        )
      )
  )
$$;

-- This RPC remains public and keeps its existing owner-only behavior.
create or replace function public.redeem_recharge_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner uuid := auth.uid();
  v_gym uuid := private.iv_current_gym_id();
  v_hash text;
  v_code public.recharge_codes%rowtype;
  v_current public.subscription_entitlements%rowtype;
  v_base timestamptz;
  v_end timestamptz;
begin
  if v_owner is null or v_gym is null then raise exception 'AUTH_REQUIRED'; end if;
  if not private.iv_is_current_gym_owner() then raise exception 'OWNER_REQUIRED'; end if;
  if p_code is null or length(trim(p_code)) < 8 then raise exception 'INVALID_RECHARGE_CODE'; end if;

  v_hash := encode(digest(upper(trim(p_code)), 'sha256'), 'hex');
  select * into v_code from public.recharge_codes where code_hash = v_hash for update;
  if not found then raise exception 'INVALID_RECHARGE_CODE'; end if;
  if v_code.revoked_at is not null then raise exception 'RECHARGE_CODE_REVOKED'; end if;
  if v_code.valid_until is not null and v_code.valid_until < now() then raise exception 'RECHARGE_CODE_EXPIRED'; end if;
  if v_code.target_email is not null and
      (v_code.target_user_id is null or v_code.target_user_id <> v_owner) then
    raise exception 'RECHARGE_CODE_NOT_ASSIGNED_TO_ACCOUNT';
  end if;

  if v_code.redeemed_at is not null then
    if v_code.redeemed_by = v_owner then
      select * into v_current from public.subscription_entitlements where gym_id = v_gym;
      return jsonb_build_object(
        'status', coalesce(v_current.status, 'free'),
        'source', v_current.source,
        'current_period_end', v_current.current_period_end,
        'already_redeemed', true
      );
    end if;
    raise exception 'RECHARGE_CODE_ALREADY_USED';
  end if;

  select * into v_current from public.subscription_entitlements where gym_id = v_gym for update;
  if found and v_current.owner_id <> v_owner then raise exception 'OWNER_GYM_MISMATCH'; end if;
  v_base := greatest(
    now(),
    coalesce(v_current.provider_period_end, now()),
    coalesce(v_current.recharge_period_end, now()),
    coalesce(v_current.manual_period_end, now())
  );
  v_end := v_base + make_interval(days => v_code.duration_days);

  insert into public.subscription_entitlements (
    owner_id, gym_id, status, source, recharge_period_end, current_period_end,
    last_verified_at, updated_at
  ) values (v_owner, v_gym, 'active', 'recharge', v_end, v_end, now(), now())
  on conflict (owner_id) do update set
    gym_id = excluded.gym_id,
    recharge_period_end = excluded.recharge_period_end,
    last_verified_at = now(),
    updated_at = now();

  update public.recharge_codes set redeemed_by = v_owner, redeemed_at = now() where id = v_code.id;
  insert into public.audit_logs (gym_id, user_id, role, action, entity_type, entity_id, metadata)
  values (v_gym, v_owner, 'owner', 'subscription_recharged', 'subscription', v_gym::text,
    jsonb_build_object('days_added', v_code.duration_days, 'current_period_end', v_end));

  return jsonb_build_object(
    'status', 'active', 'source', 'recharge', 'current_period_end', v_end,
    'days_added', v_code.duration_days, 'already_redeemed', false
  );
end;
$$;

notify pgrst, 'reload schema';
