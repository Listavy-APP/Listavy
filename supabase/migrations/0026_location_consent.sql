-- Location consent. Off by default. Set once by the homeowner on the consent screen.
-- Nothing is stored about the location itself. The assigned pro reads only this flag,
-- and only after payment (checked in the app; no location data exists yet).
alter table public.jobs
  add column if not exists location_consent boolean not null default false,
  add column if not exists location_consent_at timestamptz;

create or replace function public.set_location_consent(p_job uuid, p_allowed boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (
    select 1 from public.jobs j
     where j.id = p_job and j.homeowner_id = auth.uid()
  ) then
    raise exception 'Solo el cliente puede cambiar esta decisión.';
  end if;
  update public.jobs
     set location_consent = p_allowed,
         location_consent_at = now()
   where id = p_job;
end;
$function$;

revoke all on function public.set_location_consent(uuid, boolean) from public;
grant execute on function public.set_location_consent(uuid, boolean) to authenticated;
