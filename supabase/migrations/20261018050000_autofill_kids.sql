-- Auto-filled ("✨ estimate") markers + kids can only vote / say "I'm in" for themselves.
-- Paste into SQL Editor → Run. Safe to re-run.

-- ───────────── 1. Which fields were filled automatically (shown yellow until a person confirms/edits) ─────────────
alter table public.places add column if not exists auto_fields text[] not null default '{}';
alter table public.places drop constraint if exists places_auto_fields,
  add constraint places_auto_fields check (auto_fields <@ array['pin','nearest_hotels','travel','website_url','halal']::text[]);

-- ───────────── 2. Kids ─────────────
create or replace function public.my_group() returns text
language sql stable security definer set search_path = public as $$
  select m.grp from family_access f join members m on m.id = f.member_id where f.uid = auth.uid()
$$;
revoke all on function public.my_group() from public, anon;
grant execute on function public.my_group() to authenticated;

-- kids can't add places
drop policy if exists "family add places" on public.places;
create policy "family add places" on public.places for insert to authenticated
  with check (public.is_family() and created_by = public.my_member() and coalesce(public.my_group(), 'adult') <> 'kid');

-- kids can only tick themselves as going
drop policy if exists "kids only self (add)" on public.attendees;
drop policy if exists "kids only self (remove)" on public.attendees;
create policy "kids only self (add)" on public.attendees as restrictive for insert to authenticated
  with check (coalesce(public.my_group(), 'adult') <> 'kid' or member_id = public.my_member());
create policy "kids only self (remove)" on public.attendees as restrictive for delete to authenticated
  using (coalesce(public.my_group(), 'adult') <> 'kid' or member_id = public.my_member());

-- kids can't tick "visited"
create or replace function public.set_visited(place uuid, is_visited boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_family() or coalesce(my_group(), 'adult') = 'kid' then return false; end if;
  update places set visited = is_visited, visited_at = case when is_visited then now() else null end where id = place;
  return found;
end $$;

-- planners' edits also carry the auto-filled markers
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
    auto_fields = coalesce(r.auto_fields, '{}')
  where id = place;
  return found;
end $$;
