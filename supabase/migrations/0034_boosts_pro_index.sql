-- 0034: covering index for boosts.pro_id foreign key (advisor 0001). Applied to the project after 0033.
create index if not exists boosts_pro_id_idx on public.boosts (pro_id);
