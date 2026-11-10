-- Listavy · 0006 · Anonymous browsing of approved pro cards.
-- list_pro_cards returns approved pros only and only safe columns (no phone, no documents).
-- Anonymous visitors may browse. Requesting a job or contacting a pro still needs sign-in.
-- Work photos stay login-only: the storage policy applies to authenticated users only.
grant execute on function public.list_pro_cards(text, text, uuid) to anon;

-- RLS policies call these helpers. Without EXECUTE, an anonymous query fails with an error
-- instead of returning zero rows. Each returns false when there is no session, so granting
-- anon EXECUTE exposes no data.
grant execute on function public.is_admin() to anon;
grant execute on function public.is_job_homeowner(uuid) to anon;
grant execute on function public.is_job_party(uuid) to anon;
grant execute on function public.has_quoted_job(uuid) to anon;
