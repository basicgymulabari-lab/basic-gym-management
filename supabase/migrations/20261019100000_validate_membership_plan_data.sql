-- Enforce the same core plan invariants in the database that the client
-- enforces before saving. A receptionist with membership permission can call
-- save_current_gym_workspace directly, so UI validation alone is insufficient.
create or replace function public.iv_validate_membership_plans(p_state jsonb)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_max_safe_minor constant numeric := 9007199254740991;
  v_default_joining_fee constant numeric := 1000;
begin
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_state -> 'plans', '[]'::jsonb)) as entry(plan)
    where jsonb_typeof(plan -> 'name') is distinct from 'string'
      or coalesce(length(trim(plan ->> 'name')), 0) not between 2 and 60
      or jsonb_typeof(plan -> 'price') is distinct from 'number'
      or case
        when jsonb_typeof(plan -> 'price') = 'number' then
          round((plan ->> 'price')::numeric * 100) <= 0
          or round((plan ->> 'price')::numeric * 100) > v_max_safe_minor
        else true
      end
      or case
        when plan ? 'joiningFee' and jsonb_typeof(plan -> 'joiningFee') not in ('null', 'number') then true
        when jsonb_typeof(plan -> 'joiningFee') = 'number' then
          round((plan ->> 'joiningFee')::numeric * 100) < 0
          or round((plan ->> 'joiningFee')::numeric * 100) > v_max_safe_minor
        else false
      end
      or case
        when jsonb_typeof(plan -> 'durationDays') = 'number' then
          (plan ->> 'durationDays')::numeric < 1
          or (plan ->> 'durationDays')::numeric <> trunc((plan ->> 'durationDays')::numeric)
          or (plan ->> 'durationDays')::numeric > v_max_safe_minor
        else true
      end
      or case
        when jsonb_typeof(plan -> 'price') = 'number'
          and (not (plan ? 'joiningFee') or jsonb_typeof(plan -> 'joiningFee') in ('null', 'number')) then
          round((plan ->> 'price')::numeric * 100)
          + round(coalesce((plan ->> 'joiningFee')::numeric, v_default_joining_fee) * 100)
          > v_max_safe_minor
        else false
      end
  ) then
    raise exception 'INVALID_PLAN_DATA';
  end if;
end;
$$;

revoke all on function public.iv_validate_membership_plans(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.iv_validate_workspace_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.iv_validate_workspace(new.state);
  perform public.iv_validate_membership_plans(new.state);
  return new;
end;
$$;
