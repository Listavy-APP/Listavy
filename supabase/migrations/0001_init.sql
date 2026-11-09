-- Listavy · Sprint 0 schema
-- Standard Postgres + Supabase auth.users only. No Supabase-only features beyond auth.
-- Every table has RLS enabled. Money-moving writes (payments, payouts) are NOT
-- writable by clients; they will go through Edge Functions using the service role.

-- ---------------------------------------------------------------------------
-- Enums as check constraints (easier to migrate than Postgres enums).
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'homeowner'
              check (role in ('homeowner', 'pro', 'admin')),
  full_name   text,
  phone       text unique,            -- E.164, e.g. +18095551234 (TEST data only until verified)
  created_at  timestamptz not null default now()
);

create table public.pros (
  id                  uuid primary key references public.profiles (id) on delete cascade,
  trade               text not null check (trade in ('plumber', 'electrician', 'ac_technician')),
  zone                text not null,  -- Santo Domingo zones only (enforced in app in Sprint 1)
  price_min_dop       integer not null check (price_min_dop >= 0),
  price_max_dop       integer not null check (price_max_dop >= price_min_dop),
  -- Admin-approved only. Never self-claimed. Guarded by trigger below.
  verification_status text not null default 'pending'
                      check (verification_status in ('pending', 'approved', 'suspended')),
  verified_at         timestamptz,
  verified_by         uuid references public.profiles (id),
  plan                text not null default 'free' check (plan in ('free', 'pro')),
  created_at          timestamptz not null default now()
);

create table public.jobs (
  id                  uuid primary key default gen_random_uuid(),
  homeowner_id        uuid not null references public.profiles (id),
  pro_id              uuid references public.pros (id),
  trade               text not null check (trade in ('plumber', 'electrician', 'ac_technician')),
  zone                text not null,
  description         text not null,
  status              text not null default 'requested'
                      check (status in ('requested', 'quoted', 'accepted', 'in_progress',
                                        'awaiting_approval', 'completed', 'disputed', 'cancelled')),
  -- Planning FX rate stored on every job (brief: RD$60 = US$1 default).
  fx_rate_dop_per_usd numeric(10, 4) not null default 60.0000 check (fx_rate_dop_per_usd > 0),
  created_at          timestamptz not null default now()
);

create table public.quotes (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id) on delete cascade,
  pro_id      uuid not null references public.pros (id),
  amount_dop  integer not null check (amount_dop > 0),
  status      text not null default 'sent'
              check (status in ('sent', 'accepted', 'rejected', 'withdrawn')),
  created_at  timestamptz not null default now(),
  unique (job_id, pro_id)
);

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.jobs (id),
  provider            text not null default 'stripe',   -- PaymentProvider key; Azul later
  currency            text not null check (currency in ('USD', 'DOP')),
  amount_minor        bigint not null check (amount_minor > 0), -- cents or centavos
  fx_rate_dop_per_usd numeric(10, 4) not null check (fx_rate_dop_per_usd > 0),
  commission_dop      integer check (commission_dop >= 0),
  status              text not null default 'pending'
                      check (status in ('pending', 'held', 'released', 'refunded', 'disputed')),
  created_at          timestamptz not null default now()
);

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null unique references public.jobs (id),
  reviewer_id uuid not null references public.profiles (id),
  pro_id      uuid not null references public.pros (id),
  rating      smallint not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
  -- Sprint 4 adds the rule: only for platform-paid, completed jobs.
);

create table public.disputes (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id),
  opened_by   uuid not null references public.profiles (id),
  reason      text not null,
  status      text not null default 'open'
              check (status in ('open', 'resolved_homeowner', 'resolved_pro')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Create a profile for every new auth user. Role is always 'homeowner' here.
-- Pro and admin roles are granted only by an admin (never by the client).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Block clients from changing role, verification, or plan. Admins may change them.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() is null only for SQL editor / service role, which bootstraps the first admin.
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Solo un administrador puede cambiar el rol.';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

create or replace function public.guard_pro_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by
       or new.plan is distinct from old.plan then
      raise exception 'Solo un administrador puede verificar, suspender o cambiar el plan.';
    end if;
  end if;
  return new;
end;
$$;

create trigger pros_guard
  before update on public.pros
  for each row execute function public.guard_pro_privileges();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Cross-table checks go through SECURITY DEFINER helpers. Inline subqueries
-- between jobs and quotes would recurse through each other's policies (42P17).
-- ---------------------------------------------------------------------------

create or replace function public.is_job_homeowner(p_job uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.jobs j
                 where j.id = p_job and j.homeowner_id = (select auth.uid()));
$$;

create or replace function public.is_job_party(p_job uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.jobs j
                 where j.id = p_job
                   and (j.homeowner_id = (select auth.uid()) or j.pro_id = (select auth.uid())));
$$;

create or replace function public.has_quoted_job(p_job uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.quotes q
                 where q.job_id = p_job and q.pro_id = (select auth.uid()));
$$;

alter table public.profiles enable row level security;
alter table public.pros     enable row level security;
alter table public.jobs     enable row level security;
alter table public.quotes   enable row level security;
alter table public.payments enable row level security;
alter table public.reviews  enable row level security;
alter table public.disputes enable row level security;

-- profiles: own row; admins see all.
create policy profiles_select on public.profiles for select
  using (id = (select auth.uid()) or public.is_admin());
create policy profiles_update_own on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- pros: approved pros are public (discovery). Owners and admins see everything.
create policy pros_select_public on public.pros for select
  using (verification_status = 'approved');
create policy pros_select_owner_or_admin on public.pros for select
  using (id = (select auth.uid()) or public.is_admin());
create policy pros_insert_own on public.pros for insert
  with check (id = (select auth.uid()));
create policy pros_update_own_or_admin on public.pros for update
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- jobs: homeowner owns the job; assigned pro and quoting pros can read; admins see all.
create policy jobs_select on public.jobs for select
  using (
    homeowner_id = (select auth.uid())
    or pro_id = (select auth.uid())
    or public.has_quoted_job(id)
    or public.is_admin()
  );
create policy jobs_insert_homeowner on public.jobs for insert
  with check (homeowner_id = (select auth.uid()));
create policy jobs_update_homeowner on public.jobs for update
  using (homeowner_id = (select auth.uid()) or public.is_admin())
  with check (homeowner_id = (select auth.uid()) or public.is_admin());

-- quotes: the pro writes their own quote; the job's homeowner and admins read it.
create policy quotes_select on public.quotes for select
  using (
    pro_id = (select auth.uid())
    or public.is_job_homeowner(job_id)
    or public.is_admin()
  );
create policy quotes_insert_pro on public.quotes for insert
  with check (pro_id = (select auth.uid()));
create policy quotes_update_pro on public.quotes for update
  using (pro_id = (select auth.uid()))
  with check (pro_id = (select auth.uid()));

-- payments: READ ONLY for job parties and admins. No client writes; service role writes.
create policy payments_select on public.payments for select
  using (public.is_admin() or public.is_job_party(job_id));

-- reviews: public read; only the job's homeowner writes. Sprint 4 adds the paid-job rule.
create policy reviews_select_public on public.reviews for select using (true);
create policy reviews_insert_homeowner on public.reviews for insert
  with check (reviewer_id = (select auth.uid()) and public.is_job_homeowner(job_id));

-- disputes: job parties and admins read; job parties open; admins resolve.
create policy disputes_select on public.disputes for select
  using (public.is_admin() or public.is_job_party(job_id));
create policy disputes_insert_party on public.disputes for insert
  with check (opened_by = (select auth.uid()) and public.is_job_party(job_id));
create policy disputes_update_admin on public.disputes for update
  using (public.is_admin()) with check (public.is_admin());

-- Indexes for the lookups the app will run most.
create index jobs_homeowner_idx on public.jobs (homeowner_id);
create index jobs_pro_idx on public.jobs (pro_id);
create index quotes_job_idx on public.quotes (job_id);
create index payments_job_idx on public.payments (job_id);
create index pros_discovery_idx on public.pros (trade, zone) where verification_status = 'approved';
