-- Lets a "verify & fill" pass (e.g. Claude in chat) mark price/wait as ✨ found automatically, with sources.
-- Paste into SQL Editor → Run. Safe to re-run.

alter table public.places drop constraint if exists places_auto_fields,
  add constraint places_auto_fields check (auto_fields <@ array['pin','nearest_hotels','travel','website_url','halal','price','wait']::text[]);

alter table public.places add column if not exists auto_sources text;
alter table public.places drop constraint if exists places_auto_sources,
  add constraint places_auto_sources check (auto_sources is null or char_length(auto_sources) <= 1500);

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
    auto_fields = coalesce(r.auto_fields, '{}'), auto_sources = r.auto_sources
  where id = place;
  return found;
end $$;
