-- 0120 Retire saved addresses. Mis propiedades (0119) covers every place a client needs.
-- Verified in production before this migration: public.addresses has 0 rows.
-- No foreign keys reference public.addresses. No cascade: if a dependent appears, the drop fails loudly.

drop function if exists public.set_default_address(uuid);
drop table if exists public.addresses;
