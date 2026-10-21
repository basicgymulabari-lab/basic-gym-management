-- Permit the existing check-in and new check-in removal audit events through
-- the tenant-scoped client audit RPC.
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
begin
  select * into v_membership
  from public.gym_users
  where user_id = auth.uid() and enabled
  limit 1;
  if not found then raise exception 'GYM_MEMBERSHIP_REQUIRED'; end if;
  if p_action not in (
    'login', 'logout', 'settings_updated', 'backup_restored', 'staff_updated',
    'member_created', 'member_updated', 'member_deleted', 'payment_created',
    'membership_renewed', 'membership_corrected', 'membership_voided',
    'attendance_checked_in', 'attendance_deleted',
    'product_sold', 'expense_created', 'expense_updated', 'inquiry_updated',
    'storage_uploaded', 'storage_deleted'
  ) then raise exception 'INVALID_AUDIT_ACTION'; end if;
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
