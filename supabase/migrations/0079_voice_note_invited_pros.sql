-- 0079 Voice note readable by invited pros.
-- STATUS: APPLIED to production on 2026-11-16 after Sam's sign-off. Do not re-apply.
--
-- Fabian's decision: an invited pro can hear the client's voice note in the job brief.
-- Allowed: job parties (client, assigned pro), admins, and a pro with an 'invited' or 'sent' quote on the job.
-- Blocked: any other user, including a pro who was not invited and a pro whose quote was withdrawn/rejected/expired.
-- The photo branch is unchanged. Only the voice branch is widened.
-- Storage: this changes the body of can_view_job_photo, which the job-photos read policy
-- (job_photos_select_party) calls. No policy row changes.

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
       and (
         public.is_job_party(j.id)
         or public.is_admin()
         or exists (
           select 1 from public.quotes q
            where q.job_id = j.id
              and q.pro_id = (select auth.uid())
              and q.status in ('invited', 'sent')
         )
       )
  );
$function$;
