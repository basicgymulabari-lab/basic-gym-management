-- Read-only assertions for internal Supabase function and table grants.
do $$
declare
  v_function regprocedure;
  v_table regclass;
begin
  foreach v_function in array array[
    'public.iv_validate_workspace(jsonb)'::regprocedure,
    'public.iv_validate_private_asset_references(jsonb)'::regprocedure,
    'public.iv_validate_private_assets_trigger()'::regprocedure,
    'public.normalize_subscription_entitlement()'::regprocedure,
    'public.set_updated_at()'::regprocedure
  ] loop
    if exists (
      select 1
      from pg_proc p,
        lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl_item
      where p.oid = v_function
        and acl_item.grantee = 0
        and acl_item.privilege_type = 'EXECUTE'
    ) or has_function_privilege('anon', v_function, 'EXECUTE')
      or has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'internal helper is exposed through the Data API: %', v_function;
    end if;
    if v_function <> 'public.iv_validate_private_asset_references(jsonb)'::regprocedure
      and has_function_privilege('service_role', v_function, 'EXECUTE') then
      raise exception 'service_role retains unnecessary direct execution on internal helper: %', v_function;
    end if;
  end loop;

  -- The private-asset validator remains available to the trusted service
  -- runtime because it may be reached from a trigger executing as service_role.
  if not has_function_privilege(
    'service_role',
    'public.iv_validate_private_asset_references(jsonb)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'private-asset trigger validation lost service_role execution';
  end if;

  foreach v_table in array array[
    'public.audit_logs'::regclass,
    'public.gym_users'::regclass,
    'public.gyms'::regclass,
    'public.subscription_entitlements'::regclass
  ] loop
    if has_table_privilege('anon', v_table, 'SELECT')
      or has_table_privilege('anon', v_table, 'INSERT')
      or has_table_privilege('anon', v_table, 'UPDATE')
      or has_table_privilege('anon', v_table, 'DELETE')
      or has_table_privilege('anon', v_table, 'TRUNCATE')
      or has_table_privilege('anon', v_table, 'REFERENCES')
      or has_table_privilege('anon', v_table, 'TRIGGER')
      or has_table_privilege('anon', v_table, 'MAINTAIN') then
      raise exception 'anonymous role retains table privileges on %', v_table;
    end if;
    if has_table_privilege('authenticated', v_table, 'INSERT')
      or has_table_privilege('authenticated', v_table, 'UPDATE')
      or has_table_privilege('authenticated', v_table, 'DELETE')
      or has_table_privilege('authenticated', v_table, 'TRUNCATE')
      or has_table_privilege('authenticated', v_table, 'REFERENCES')
      or has_table_privilege('authenticated', v_table, 'TRIGGER')
      or has_table_privilege('authenticated', v_table, 'MAINTAIN') then
      raise exception 'authenticated role retains an unnecessary table privilege on %', v_table;
    end if;
    if not (select relrowsecurity from pg_class where oid = v_table) then
      raise exception 'row-level security is disabled on %', v_table;
    end if;
    if not has_table_privilege('service_role', v_table, 'SELECT')
      or not has_table_privilege('service_role', v_table, 'INSERT')
      or not has_table_privilege('service_role', v_table, 'UPDATE')
      or not has_table_privilege('service_role', v_table, 'DELETE') then
      raise exception 'trusted service_role CRUD access was changed on %', v_table;
    end if;
  end loop;

  if not has_table_privilege('authenticated', 'public.gym_users', 'SELECT')
    or not has_table_privilege('authenticated', 'public.gyms', 'SELECT')
    or not has_table_privilege('authenticated', 'public.subscription_entitlements', 'SELECT') then
    raise exception 'required authenticated RLS-scoped reads were revoked';
  end if;
  if not has_table_privilege('authenticated', 'public.audit_logs', 'SELECT') then
    raise exception 'required authenticated RLS-scoped audit-log read was revoked';
  end if;
end;
$$;
