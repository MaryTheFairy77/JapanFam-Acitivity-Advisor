-- Adds map coordinates + typical visit length. Paste into SQL Editor → Run. Safe to re-run.

alter table public.places add column if not exists lat double precision;
alter table public.places add column if not exists lng double precision;
alter table public.places add column if not exists visit_minutes integer; -- how long you'd spend there

-- Coordinates for the seeded activities (from their Google Maps links)
update public.places set lat = 35.5248227, lng = 138.7299428, visit_minutes = coalesce(visit_minutes, 240) where name = 'Fuji Go Q tours & glamping';
update public.places set lat = 34.9946662, lng = 135.784661,  visit_minutes = coalesce(visit_minutes, 120) where name = 'Kiyomizudera temple';
update public.places set lat = 35.624512,  lng = 139.429293,  visit_minutes = coalesce(visit_minutes, 300) where name = 'Sanrio Puroland';
update public.places set lat = 34.6679655, lng = 135.4303229, visit_minutes = coalesce(visit_minutes, 360) where name = 'Super Nintendo World';
update public.places set lat = 35.6707772, lng = 139.7661131, visit_minutes = coalesce(visit_minutes, 60)  where name = 'Art Aquarium Museum';
