-- Phone change: keep profiles.phone in step with auth.users.phone.
--
-- The app changes the phone with auth.updateUser({ phone }) followed by
-- verifyOtp({ type: 'phone_change' }). GoTrue writes auth.users.phone in its own
-- transaction, where auth.uid() is null, so guard_profile_privileges (0009) does not
-- block this trigger's write to profiles.phone. Owners still cannot change profiles.phone
-- directly: the guard is unchanged.

create or replace function public.sync_profile_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is distinct from old.phone then
    update public.profiles set phone = new.phone where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_phone_changed
  after update of phone on auth.users
  for each row execute function public.sync_profile_phone();
