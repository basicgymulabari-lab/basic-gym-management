-- Keep client audit events tenant-scoped and require the permission that
-- corresponds to each event. Audit events are append-only, but forged entries
-- could otherwise mislead owners reviewing their activity history.
create or replace function public.record_audit_event(
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.gym_users%rowtype;
  v_allowed boolean := false;
  v_asset_gym_id text;
  v_asset_kind text;
begin
  select * into v_membership
  from public.gym_users
  where user_id = auth.uid() and enabled
  limit 1;
  if not found then raise exception 'GYM_MEMBERSHIP_REQUIRED'; end if;
  if p_action is null then raise exception 'INVALID_AUDIT_ACTION'; end if;

  if p_action in ('login', 'logout') then
    v_allowed := true;
  elsif p_action in ('settings_updated', 'backup_restored', 'staff_updated') then
    v_allowed := v_membership.role = 'owner';
  elsif p_action in (
    'member_created', 'member_updated', 'member_deleted',
    'attendance_checked_in', 'attendance_deleted'
  ) then
    v_allowed := v_membership.role = 'owner'
      or (
        v_membership.role = 'receptionist'
        and public.iv_has_permission(v_membership.permissions, 'members')
      );
  elsif p_action in ('membership_renewed', 'membership_corrected', 'membership_voided') then
    v_allowed := v_membership.role = 'owner'
      or (
        v_membership.role = 'receptionist'
        and public.iv_has_permission(v_membership.permissions, 'memberships')
      );
  elsif p_action = 'payment_created' then
    v_allowed := v_membership.role = 'owner'
      or (
        v_membership.role = 'receptionist'
        and (
          public.iv_has_permission(v_membership.permissions, 'payments')
          or public.iv_has_permission(v_membership.permissions, 'products')
        )
      );
  elsif p_action = 'product_sold' then
    v_allowed := v_membership.role = 'owner'
      or (
        v_membership.role = 'receptionist'
        and public.iv_has_permission(v_membership.permissions, 'products')
      );
  elsif p_action in ('expense_created', 'expense_updated') then
    v_allowed := v_membership.role = 'owner'
      or (
        v_membership.role = 'receptionist'
        and public.iv_has_permission(v_membership.permissions, 'expenses')
      );
  elsif p_action = 'inquiry_updated' then
    v_allowed := v_membership.role = 'owner'
      or (
        v_membership.role = 'receptionist'
        and public.iv_has_permission(v_membership.permissions, 'inquiries')
      );
  elsif p_action in ('storage_uploaded', 'storage_deleted') then
    v_asset_gym_id := split_part(coalesce(p_entity_id, ''), '/', 1);
    v_asset_kind := split_part(coalesce(p_entity_id, ''), '/', 2);
    v_allowed := v_asset_gym_id = v_membership.gym_id::text
      and v_asset_kind in ('members', 'expenses', 'branding')
      and (
        (p_action = 'storage_uploaded' and p_entity_type = v_asset_kind)
        or (p_action = 'storage_deleted' and p_entity_type = 'private_asset')
      )
      and (
        v_membership.role = 'owner'
        or (
          v_membership.role = 'receptionist'
          and (
            (v_asset_kind = 'members' and public.iv_has_permission(v_membership.permissions, 'members'))
            or (v_asset_kind = 'expenses' and public.iv_has_permission(v_membership.permissions, 'expenses'))
          )
        )
      );
  else
    raise exception 'INVALID_AUDIT_ACTION';
  end if;

  if not v_allowed then
    raise exception using errcode = '42501', message = 'AUDIT_ACTION_FORBIDDEN';
  end if;

  insert into public.audit_logs (gym_id, user_id, role, action, entity_type, entity_id, metadata)
  values (
    v_membership.gym_id,
    auth.uid(),
    v_membership.role,
    p_action,
    left(p_entity_type, 80),
    left(p_entity_id, 160),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.record_audit_event(text, text, text, jsonb)
  from public, anon, service_role;
grant execute on function public.record_audit_event(text, text, text, jsonb)
  to authenticated;
