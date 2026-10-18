-- Activity categories for filtering (🛍️ shopping, 🏯 sights, 🎡 fun, 🍡 food & treats). Safe to re-run.
alter table public.places add column if not exists tags text[] not null default '{}';
alter table public.places drop constraint if exists places_tags,
  add constraint places_tags check (tags <@ array['shopping','sightseeing','experience','theme_park','food']::text[]);

-- tag the original activities
update public.places set tags = array['theme_park'] where name in ('Sanrio Puroland','Super Nintendo World','Universal Studios') and tags = '{}';
update public.places set tags = array['experience'] where name = 'Fuji Go Q tours & glamping' and tags = '{}';
update public.places set tags = array['sightseeing'] where name in ('Kiyomizudera temple','Art Aquarium Museum') and tags = '{}';

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
    auto_fields = coalesce(r.auto_fields, '{}'), auto_sources = r.auto_sources, tags = coalesce(r.tags, '{}')
  where id = place;
  return found;
end $$;
