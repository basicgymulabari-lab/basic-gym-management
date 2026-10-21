-- Realtime's daily message partitions are created when a client connects.
-- Platform-table writes can arrive before the CEO console connects on a day;
-- in that case skip the ephemeral refresh hint and let the protected 30s poll
-- refresh the dashboard. This avoids MissingPartition without changing data,
-- removing triggers, or broadening the private channel policy.
create or replace function public.iv_broadcast_platform_refresh()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, realtime
as $$
declare
  v_today_partition regclass;
begin
  v_today_partition := pg_catalog.to_regclass(
    'realtime.messages_' ||
    pg_catalog.to_char(pg_catalog.clock_timestamp() at time zone 'UTC', 'YYYY_MM_DD')
  );

  if v_today_partition is null then
    return null;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'schema', tg_table_schema,
      'table', tg_table_name,
      'operation', tg_op,
      'changed_at', clock_timestamp()
    ),
    'platform_data_changed',
    'platform-admin-live',
    true
  );
  return null;
exception when others then
  -- Realtime is an enhancement: a websocket/partition issue must never block
  -- the underlying gym, billing, invite, backup, or audit transaction.
  raise warning 'Platform refresh broadcast failed for %.%: %', tg_table_schema, tg_table_name, sqlerrm;
  return null;
end;
$$;

revoke all on function public.iv_broadcast_platform_refresh() from public, anon, authenticated, service_role;
