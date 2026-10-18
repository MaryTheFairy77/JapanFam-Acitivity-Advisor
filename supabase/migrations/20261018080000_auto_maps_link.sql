-- Allow a generated (✨) Google Maps link. Safe to re-run.
alter table public.places drop constraint if exists places_auto_fields,
  add constraint places_auto_fields check (auto_fields <@ array['pin','nearest_hotels','travel','website_url','halal','price','wait','maps_url']::text[]);
