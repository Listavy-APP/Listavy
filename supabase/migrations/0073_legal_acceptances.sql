-- 0073 · Record of legal acceptances.
-- One row per user, document and version, written when the user accepts: sign-up (terms, privacy),
-- pro application (pro_terms, community), and payment (cancellation).
-- Writes go only through record_legal_acceptance(), which stamps the user from auth.uid().
-- The table has no client insert, update or delete policy. Users can read only their own rows.
-- No foreign key to auth.users, so the record remains after account deletion (retention per the privacy policy). Sam to confirm.
-- Not applied. Sam reviews the SQL before it is applied to production.

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  document text not null check (document in ('privacy', 'terms', 'cookies', 'cancellation', 'community', 'pro_terms')),
  version text not null check (length(version) between 1 and 32),
  accepted_at timestamptz not null default now()
);

create index if not exists legal_acceptances_user_idx on public.legal_acceptances (user_id, accepted_at desc);

alter table public.legal_acceptances enable row level security;

drop policy if exists legal_acceptances_own_select on public.legal_acceptances;
create policy legal_acceptances_own_select on public.legal_acceptances
  for select using (user_id = (select auth.uid()));

-- Only the security definer function writes. No insert, update or delete policy for clients.
revoke all on public.legal_acceptances from public, anon, authenticated;
grant select on public.legal_acceptances to authenticated;

create or replace function public.record_legal_acceptance(p_document text, p_version text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Debes entrar primero.'; end if;
  if p_document not in ('privacy', 'terms', 'cookies', 'cancellation', 'community', 'pro_terms') then
    raise exception 'Documento no válido.';
  end if;
  -- One row per document and version. Repeat sign-ins and repeat payments add nothing.
  insert into public.legal_acceptances (user_id, document, version)
  select uid, p_document, p_version
   where not exists (
     select 1 from public.legal_acceptances
      where user_id = uid and document = p_document and version = p_version
   );
end;
$$;

revoke execute on function public.record_legal_acceptance(text, text) from public, anon;
grant execute on function public.record_legal_acceptance(text, text) to authenticated;
