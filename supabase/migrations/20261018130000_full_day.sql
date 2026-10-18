-- ☀️ Full-day activities (theme parks, day trips): planner gives them the whole day, food = supper after Maghrib. Safe to re-run.
alter table public.places add column if not exists full_day boolean not null default false;

update public.places set full_day = true
where kind = 'activity' and full_day = false
  and name in ('Super Nintendo World / Universal Studios', 'Sanrio Puroland', 'Fuji Go Q tours & glamping');

-- planner edit: keep full_day when the caller doesn't send it (e.g. bulk auto-fill)
create or replace function public.planner_update_place(place uuid, data jsonb, code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare r places%rowtype;
begin
  if not is_family() or not _check_code('admin', code) then return false; end if;
  r := jsonb_populate_record(null::places, data);
  update places set
    name = r.name, description = r.description, price_jpy = r.price_jpy, halal = r.halal, taste = r.taste,
    nearest_hotels = coalesce(r.nearest_hotels, '{}'), travel_text = r.travel_text, travel_minutes = r.travel_minutes,
    wait_text = r.wait_text, wait_minutes = r.wait_minutes, long_line = r.long_line, maps_url = r.maps_url,
    website_url = r.website_url, lat = r.lat, lng = r.lng, visit_minutes = r.visit_minutes, image_url = r.image_url,
    auto_fields = coalesce(r.auto_fields, '{}'), auto_sources = r.auto_sources, category = r.category,
    full_day = case when data ? 'full_day' then coalesce(r.full_day, false) else places.full_day end
  where id = place;
  return found;
end $$;
