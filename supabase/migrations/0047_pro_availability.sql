-- Pro availability switch. Default true, so no existing pro changes. Applied to qmugoumizvtvuzndhosq.
alter table public.pros
  add column if not exists available boolean not null default true;
