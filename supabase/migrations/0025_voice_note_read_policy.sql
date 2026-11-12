-- Voice notes: homeowner and assigned pro can read the job's voice file.
-- Extends can_view_job_photo, which the job-photos storage read policy uses.
-- Quoting pros are not included: a voice note is for the job's parties only.
create or replace function public.can_view_job_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.job_photos jp
     where jp.storage_path = p_name
       and (public.is_job_party(jp.job_id) or public.has_quoted_job(jp.job_id) or public.is_admin())
  )
  or exists (
    select 1 from public.jobs j
     where j.voice_path = p_name
       and (public.is_job_party(j.id) or public.is_admin())
  );
$function$;
