-- Activity categories (🛍 shopping, 🍡 food & treats, 🎢 fun, ⛩ culture, 🌿 nature). Safe to re-run.
alter table public.places add column if not exists category text;
alter table public.places drop constraint if exists places_category,
  add constraint places_category check (category is null or category in ('shopping','food','fun','culture','nature'));

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
    auto_fields = coalesce(r.auto_fields, '{}'), auto_sources = r.auto_sources, category = r.category
  where id = place;
  return found;
end $$;

-- categorise the original activities (anyone who added them can change it)
update public.places set category = 'fun'     where kind = 'activity' and category is null and name in ('Fuji Go Q tours & glamping','Sanrio Puroland','Super Nintendo World');
update public.places set category = 'culture' where kind = 'activity' and category is null and name in ('Kiyomizudera temple','Art Aquarium Museum');
