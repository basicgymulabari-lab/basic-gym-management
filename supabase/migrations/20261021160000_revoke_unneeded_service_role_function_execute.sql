-- These helpers and user operations rely on auth.uid() and are invoked by
-- authenticated clients or storage/RLS policies. The service_role key is not
-- used for these calls and should not have direct EXECUTE grants.
revoke execute on function public.iv_can_access_private_object(text)
  from service_role;

revoke execute on function public.iv_can_manage_member_attendance()
  from service_role;

revoke execute on function public.record_current_member_attendance(text, date)
  from service_role;

revoke execute on function public.redeem_recharge_code(text)
  from service_role;
