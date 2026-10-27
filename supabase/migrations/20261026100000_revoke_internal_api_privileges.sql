-- Keep internal validation and trigger routines out of the public Data API.
-- Their callers are trusted SECURITY DEFINER functions or installed triggers.
revoke all on function public.iv_validate_workspace(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.iv_validate_private_asset_references(jsonb)
  from public, anon, authenticated;
grant execute on function public.iv_validate_private_asset_references(jsonb)
  to service_role;
revoke all on function public.iv_validate_private_assets_trigger()
  from public, anon, authenticated, service_role;
revoke all on function public.normalize_subscription_entitlement()
  from public, anon, authenticated, service_role;
revoke all on function public.set_updated_at()
  from public, anon, authenticated, service_role;

-- Anonymous clients do not use gym metadata directly; the app obtains its
-- authorized context through authenticated RPCs. Remove the default anon
-- table grants while preserving authenticated RLS-scoped reads.
revoke all on table public.audit_logs, public.gym_users, public.gyms,
  public.subscription_entitlements from anon;

-- MAINTAIN is not required by either app role for these API-facing tables.
revoke maintain on table public.audit_logs, public.gym_users, public.gyms,
  public.subscription_entitlements from anon, authenticated;
