-- Saved addresses for clients (stored only; not wired into /pedir).
-- Owner-only RLS. Applied to project qmugoumizvtvuzndhosq.

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (label in ('Casa', 'Trabajo', 'Otra')),
  street text not null check (char_length(street) between 1 and 200),
  zone text,
  reference text check (reference is null or char_length(reference) <= 200),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index addresses_user_id_idx on public.addresses (user_id);

create unique index addresses_one_default_per_user
  on public.addresses (user_id) where is_default;

alter table public.addresses enable row level security;

create policy addresses_owner_select on public.addresses
  for select to authenticated using (user_id = auth.uid());
create policy addresses_owner_insert on public.addresses
  for insert to authenticated with check (user_id = auth.uid());
create policy addresses_owner_update on public.addresses
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy addresses_owner_delete on public.addresses
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.addresses from anon;
