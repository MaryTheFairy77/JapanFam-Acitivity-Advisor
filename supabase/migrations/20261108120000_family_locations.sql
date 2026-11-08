-- Family finder: opt-in "where is everyone" for the trip. Safe to re-run.
-- Privacy rules (enforced HERE, not just in the app):
--   * one row per person, only that person's phone can write it (member_id = my_member())
--   * positions outside Japan are rejected by a CHECK constraint (no tracking at home)
--   * positions older than 6 hours are invisible to everyone (select policy), and
--     purge_old_locations() deletes anything older than 24 h (called by the app on load)
--   * turning sharing off deletes your row
create table if not exists public.locations (
  member_id uuid primary key references public.members(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy_m integer,
  updated_at timestamptz not null default now(),
  constraint locations_accuracy check (accuracy_m is null or accuracy_m between 0 and 100000)
);
alter table public.locations enable row level security;
revoke all on public.locations from anon;
grant select, insert, update, delete on public.locations to authenticated;

drop policy if exists "family sees recent locations" on public.locations;
create policy "family sees recent locations" on public.locations for select to authenticated
  using (public.is_family() and (member_id = public.my_member() or updated_at > now() - interval '6 hours'));
drop policy if exists "share own location" on public.locations;
create policy "share own location" on public.locations for insert to authenticated
  with check (public.is_family() and member_id = public.my_member());
drop policy if exists "update own location" on public.locations;
create policy "update own location" on public.locations for update to authenticated
  using (public.is_family() and member_id = public.my_member())
  with check (public.is_family() and member_id = public.my_member());
drop policy if exists "stop sharing own location" on public.locations;
create policy "stop sharing own location" on public.locations for delete to authenticated
  using (public.is_family() and member_id = public.my_member());

-- server sets the timestamp (a phone can't fake "just now")
create or replace function public.locations_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists locations_touch on public.locations;
create trigger locations_touch before insert or update on public.locations
  for each row execute function public.locations_touch();

create or replace function public.purge_old_locations() returns void
language sql security definer set search_path = public as $$
  delete from locations where updated_at < now() - interval '24 hours';
$$;
revoke all on function public.purge_old_locations() from public, anon;
grant execute on function public.purge_old_locations() to authenticated;

-- Japan as 5 boxes tracing the islands (excludes Korea/Jeju/Vladivostok). Same boxes as JAPAN_BOXES in src/geo.ts.
create or replace function public.in_japan(lat double precision, lng double precision) returns boolean
language sql immutable as $$
  select (lat between 24.0 and 31.0 and lng between 122.9 and 131.5)
      or (lat between 31.0 and 34.0 and lng between 128.5 and 132.0)
      or (lat between 32.7 and 36.0 and lng between 130.8 and 137.0)
      or (lat between 34.0 and 41.6 and lng between 135.0 and 142.2)
      or (lat between 41.3 and 45.6 and lng between 139.3 and 146.0)
$$;
alter table public.locations drop constraint if exists locations_in_japan;
alter table public.locations add constraint locations_in_japan check (public.in_japan(lat, lng));

alter function public.in_japan(double precision, double precision) set search_path = public;
alter function public.locations_touch() set search_path = public;
alter function public.places_lock_owners() set search_path = public;
