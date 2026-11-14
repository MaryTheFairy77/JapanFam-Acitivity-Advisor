-- 14 Nov 2026: family finder removed (Maryam's call). Near me stays (on-phone only, nothing stored).
-- Safe to re-run.
drop table if exists public.locations cascade;
drop function if exists public.purge_old_locations();
drop function if exists public.locations_touch();
drop function if exists public.in_japan(double precision, double precision);
