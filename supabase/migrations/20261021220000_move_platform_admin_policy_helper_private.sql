-- Keep the public policy helper's signature and execute grants, but move its
-- SECURITY DEFINER implementation out of the exposed Data API schema.
-- RLS policies and existing admin RPCs continue to call the public invoker
-- wrapper. This changes no table or user data.
do $migration$
declare
  v_helper oid := to_regprocedure('public.iv_is_platform_admin()');
begin
  if to_regnamespace('private') is null then
    raise exception 'Schema private is missing; refusing to move the admin helper.';
  end if;
  if v_helper is null then
    raise exception 'public.iv_is_platform_admin() is missing; refusing to move the admin helper.';
  end if;
  if to_regprocedure('private.iv_is_platform_admin()') is not null then
    raise exception 'private.iv_is_platform_admin() already exists; inspect it before applying this migration.';
  end if;
  if not has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'authenticated lacks USAGE on private; refusing to change the policy helper.';
  end if;
  if not (select p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
          from pg_proc p where p.oid = v_helper) then
    raise exception 'Expected postgres-owned SECURITY DEFINER admin helper; refusing rewrite.';
  end if;
  if not has_function_privilege('authenticated', v_helper, 'EXECUTE')
     or has_function_privilege('anon', v_helper, 'EXECUTE')
     or has_function_privilege('service_role', v_helper, 'EXECUTE') then
    raise exception 'Admin helper grants differ from authenticated-only preflight; refusing rewrite.';
  end if;
  if not exists (
    select 1 from pg_policy pol
    where coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') like '%iv_is_platform_admin%'
       or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') like '%iv_is_platform_admin%'
  ) then
    raise exception 'No RLS policy references the admin helper; inspect dependencies before rewriting.';
  end if;
end;
$migration$;

create function private.iv_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
      and enabled
  )
$$;

revoke all on function private.iv_is_platform_admin() from public, anon, service_role;
grant execute on function private.iv_is_platform_admin() to authenticated;

create or replace function public.iv_is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select private.iv_is_platform_admin()
$$;

revoke all on function public.iv_is_platform_admin() from public, anon, service_role;
grant execute on function public.iv_is_platform_admin() to authenticated;

notify pgrst, 'reload schema';
