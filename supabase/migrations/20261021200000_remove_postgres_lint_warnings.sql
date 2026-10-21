-- Remove dead declarations and correct the empty integer-array initializer
-- identified by the linked database linter. These rewrites preserve function
-- behavior and do not modify table rows or function grants.
do $migration$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.generate_recharge_codes(integer,integer,integer,text,text)'::regprocedure
  ) into v_definition;

  v_old := $old$  v_index integer;
$old$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Recharge-code v_index declaration changed; refusing rewrite.';
  end if;
  v_definition := replace(v_definition, v_old, '');

  v_old := $old$  v_code_no integer;
$old$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Recharge-code v_code_no declaration changed; refusing rewrite.';
  end if;
  execute replace(v_definition, v_old, '');

  select pg_get_functiondef(
    'public.platform_import_migration_members(uuid,uuid,jsonb,boolean)'::regprocedure
  ) into v_definition;

  v_old := $old$v_seen_rows integer[] := '{}';$old$;
  v_new := $new$v_seen_rows integer[] := ARRAY[]::integer[];$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Member-import empty-array initializer changed; refusing rewrite.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$v_total integer; v_success integer; v_skipped integer; v_failed integer; v_operation_status text;$old$;
  v_new := $new$v_success integer; v_skipped integer; v_failed integer; v_operation_status text;$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Member-import count declarations changed; refusing rewrite.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$
  select count(*)::integer, count(*) filter (where outcome = 'imported')::integer,
    count(*) filter (where outcome = 'skipped')::integer, count(*) filter (where outcome = 'failed')::integer
    into v_total, v_success, v_skipped, v_failed
    from public.platform_member_migration_items where operation_id = p_operation_id;
$old$;
  v_new := $new$
  select count(*) filter (where outcome = 'imported')::integer,
    count(*) filter (where outcome = 'skipped')::integer, count(*) filter (where outcome = 'failed')::integer
    into v_success, v_skipped, v_failed
    from public.platform_member_migration_items where operation_id = p_operation_id;
$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Member-import aggregate query changed; refusing rewrite.';
  end if;
  execute replace(v_definition, v_old, v_new);

  select pg_get_functiondef(
    'public.platform_transfer_members(uuid,uuid,uuid,text[],integer,text[],jsonb,boolean,text[],boolean)'::regprocedure
  ) into v_definition;

  v_old := $old$v_member_id text; v_member jsonb; v_new_member jsonb; v_current jsonb; v_copy_membership jsonb;$old$;
  v_new := $new$v_member_id text; v_member jsonb; v_new_member jsonb; v_copy_membership jsonb;$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Member-transfer unused-current declaration changed; refusing rewrite.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$v_duplicate boolean; v_moved integer := 0; v_skipped integer := 0; v_failed integer := 0;$old$;
  v_new := $new$v_duplicate boolean; v_skipped integer := 0; v_failed integer := 0;$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Member-transfer unused-moved declaration changed; refusing rewrite.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$v_source_timezone text; v_source_today date;$old$;
  v_new := $new$v_source_timezone text;$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Member-transfer source-date declarations changed; refusing rewrite.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$  v_source_today := (now() at time zone v_source_timezone)::date;
$old$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Member-transfer source-date assignment changed; refusing rewrite.';
  end if;
  execute replace(v_definition, v_old, '');

  select pg_get_functiondef(
    'public.platform_list_member_migration_members(uuid,uuid,text,integer,integer)'::regprocedure
  ) into v_definition;

  v_old := $old$v_source_name text;$old$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Member-preview unused source-name declaration changed; refusing rewrite.';
  end if;
  v_definition := replace(v_definition, v_old, '');

  v_old := $old$  select w.state, g.name into v_source, v_source_name$old$;
  v_new := $new$  select w.state into v_source$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Member-preview source lookup changed; refusing rewrite.';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;
