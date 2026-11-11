-- Listavy · 0010 · Account deletion.
-- Rules (operations plan 7.2A/7.2B, product plan 2.1):
--   * Blocked while the customer has a pro profile, an open job, a held or disputed payment, or an open dispute.
--   * Personal data is removed: name, phone, email, zone, photo, verification codes.
--   * Job, payment, review, and dispute records stay, with the job description replaced by '[eliminado]'.
--   * The profile row stays as an anonymised tombstone so those records keep their references.
--     The auth user is deleted by the delete-account Edge Function (service role), which removes the phone login.
--   * Callable by the service role only.

-- Profile rows outlive auth users (tombstones). Without this, deleting the auth user cascades
-- into profiles and then fails on jobs.homeowner_id, which has no cascade.
alter table public.profiles drop constraint profiles_id_fkey;

create or replace function public.anonymise_customer(p_customer uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[];
begin
  if exists (select 1 from public.pros where id = p_customer) then
    raise exception 'Cierra tu perfil profesional antes de eliminar la cuenta.';
  end if;
  if exists (select 1 from public.jobs
              where homeowner_id = p_customer and status not in ('completed', 'cancelled')) then
    raise exception 'Tienes trabajos abiertos. Ciérralos antes de eliminar la cuenta.';
  end if;
  if exists (select 1 from public.payments p join public.jobs j on j.id = p.job_id
              where j.homeowner_id = p_customer and p.status in ('pending', 'held', 'disputed')) then
    raise exception 'Tienes pagos retenidos o en disputa. Espera a que se liberen antes de eliminar la cuenta.';
  end if;
  if exists (select 1 from public.disputes d join public.jobs j on j.id = d.job_id
              where d.status = 'open' and (j.homeowner_id = p_customer or d.opened_by = p_customer)) then
    raise exception 'Tienes una disputa abierta. Espera a que se resuelva antes de eliminar la cuenta.';
  end if;

  select array_remove(array[avatar_path], null) into v_paths
    from public.profiles where id = p_customer;

  update public.jobs set description = '[eliminado]' where homeowner_id = p_customer;
  delete from public.email_verifications where user_id = p_customer;
  update public.profiles
     set full_name = null, phone = null, email = null, email_verified_at = null,
         zone = null, avatar_path = null
   where id = p_customer;

  return coalesce(v_paths, '{}');
end;
$$;

revoke execute on function public.anonymise_customer(uuid) from public, anon, authenticated;
grant execute on function public.anonymise_customer(uuid) to service_role;
