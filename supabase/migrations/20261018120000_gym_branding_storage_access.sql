-- Let gym staff display the private gym logo in shared workspace branding.
-- Writes remain owner-only through iv_can_write_private_object.
create or replace function public.iv_can_access_private_object(p_name text)
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
      and membership.enabled
      and membership.gym_id::text = split_part(p_name, '/', 1)
      and (
        membership.role = 'owner'
        or (
          membership.role = 'receptionist'
          and (
            (split_part(p_name, '/', 2) = 'members' and public.iv_has_permission(membership.permissions, 'members'))
            or
            (split_part(p_name, '/', 2) = 'expenses' and public.iv_has_permission(membership.permissions, 'expenses'))
            or split_part(p_name, '/', 2) = 'branding'
          )
        )
      )
  )
$$;

revoke all on function public.iv_can_access_private_object(text) from public, anon;
grant execute on function public.iv_can_access_private_object(text) to authenticated;
