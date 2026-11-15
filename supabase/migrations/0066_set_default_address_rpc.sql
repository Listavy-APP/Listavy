-- 0066 · Set the default address in one transaction.
-- Before: the client ran two statements (clear the old default, then set the new one). A failure
-- between them left the user with no default. This function does both in one transaction.
-- Owner-only: the address must belong to the caller. RLS on addresses also applies.
-- Not applied. Sam reviews on the preview, Fabian approves the apply.

create or replace function public.set_default_address(p_address uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.addresses where id = p_address;
  if v_owner is null or v_owner is distinct from (select auth.uid()) then
    raise exception 'No encontramos esa dirección.';
  end if;

  -- Clear the old default first, then set the new one (the unique index allows one default per user).
  update public.addresses set is_default = false
   where user_id = v_owner and is_default and id <> p_address;
  update public.addresses set is_default = true
   where id = p_address and not is_default;
end;
$$;

revoke execute on function public.set_default_address(uuid) from public, anon;
grant execute on function public.set_default_address(uuid) to authenticated;
