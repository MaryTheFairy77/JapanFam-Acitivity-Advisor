-- Photos for places + "only the person who added it (or a trip planner) can edit it".
-- Paste into SQL Editor → Run. Safe to re-run.

-- ───────────── 1. Link each phone to the person who picked their name ─────────────
alter table public.family_access add column if not exists member_id uuid references public.members(id) on delete set null;

create or replace function public.my_member() returns uuid
language sql stable security definer set search_path = public as $$
  select member_id from family_access where uid = auth.uid()
$$;

create or replace function public.claim_member(member uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_family() or not exists (select 1 from members where id = member) then return false; end if;
  update family_access set member_id = member where uid = auth.uid();
  return true;
end $$;

-- ───────────── 2. Photos ─────────────
alter table public.places add column if not exists image_url text;
alter table public.places drop constraint if exists places_image_url,
  add constraint places_image_url check (image_url is null or ((image_url ~* '^https?://' or image_url ~ '^storage:[A-Za-z0-9/_.-]+$') and char_length(image_url) <= 2000));

-- private bucket: photos are only readable by family phones (via short-lived signed links)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('place-photos', 'place-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "family read photos" on storage.objects;
drop policy if exists "family upload photos" on storage.objects;
create policy "family read photos" on storage.objects for select to authenticated
  using (bucket_id = 'place-photos' and public.is_family());
create policy "family upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'place-photos' and public.is_family());

-- ───────────── 3. Who can change what ─────────────
-- places: everyone in the family can see + add; only the creator can edit directly.
drop policy if exists "family only" on public.places;
drop policy if exists "family read places" on public.places;
drop policy if exists "family add places" on public.places;
drop policy if exists "creator edits place" on public.places;
create policy "family read places" on public.places for select to authenticated using (public.is_family());
create policy "family add places" on public.places for insert to authenticated
  with check (public.is_family() and created_by = public.my_member());
create policy "creator edits place" on public.places for update to authenticated
  using (public.is_family() and created_by is not null and created_by = public.my_member())
  with check (public.is_family() and created_by = public.my_member());

-- members: everyone can see the family list; you can only change your own nickname/avatar.
drop policy if exists "family only" on public.members;
drop policy if exists "family read members" on public.members;
drop policy if exists "edit own profile" on public.members;
create policy "family read members" on public.members for select to authenticated using (public.is_family());
create policy "edit own profile" on public.members for update to authenticated
  using (public.is_family() and id = public.my_member()) with check (public.is_family() and id = public.my_member());

-- "Visited" stays a family-wide tick (anyone can tick it)
create or replace function public.set_visited(place uuid, is_visited boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_family() then return false; end if;
  update places set visited = is_visited, visited_at = case when is_visited then now() else null end where id = place;
  return found;
end $$;

-- Trip planners can edit ANY place with the planner code
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
    website_url = r.website_url, lat = r.lat, lng = r.lng, visit_minutes = r.visit_minutes, image_url = r.image_url
  where id = place;
  return found;
end $$;

revoke all on function public.my_member(), public.claim_member(uuid), public.set_visited(uuid, boolean),
  public.planner_update_place(uuid, jsonb, text) from public, anon;
grant execute on function public.my_member(), public.claim_member(uuid), public.set_visited(uuid, boolean),
  public.planner_update_place(uuid, jsonb, text) to authenticated;
