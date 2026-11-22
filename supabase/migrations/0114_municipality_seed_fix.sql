-- 0114: add two municipalities to the Santo Domingo province (Fabian, 2026-11-22). Total 160.
-- La Caleta: municipality since Ley 39-24 (Aug 2024), formerly a district of Boca Chica.
--   Not the La Romana district of the same name.
-- La Victoria: elevated by Ley 15-24. Included now, ahead of its 2028 electoral effect.
-- Coordinates are approximate seat centroids (ordering only, never shown as exact).
-- Additive: no function, policy or existing row changes. legacy_city stays null.
insert into public.municipalities (province, name, display_name, lat, lng) values
  ('Santo Domingo', 'La Caleta', 'La Caleta', 18.4520, -69.6830),
  ('Santo Domingo', 'La Victoria', 'La Victoria', 18.5850, -69.8520)
on conflict (province, name) do nothing;
