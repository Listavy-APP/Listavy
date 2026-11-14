-- Pro bio (public, up to 500 characters). Applied to project qmugoumizvtvuzndhosq.
alter table public.pros
  add column if not exists bio text
  check (bio is null or char_length(bio) <= 500);
