-- Saved pros ("Guardados"). Owner-only RLS, no update policy. Applied to project qmugoumizvtvuzndhosq.
create table public.saved_pros (
  user_id uuid not null references public.profiles (id) on delete cascade,
  pro_id uuid not null references public.pros (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, pro_id)
);

create index saved_pros_pro_id_idx on public.saved_pros (pro_id);

alter table public.saved_pros enable row level security;

create policy saved_pros_owner_select on public.saved_pros
  for select to authenticated using (user_id = auth.uid());
create policy saved_pros_owner_insert on public.saved_pros
  for insert to authenticated with check (user_id = auth.uid());
create policy saved_pros_owner_delete on public.saved_pros
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.saved_pros from anon;
