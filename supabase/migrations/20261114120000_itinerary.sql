-- 14 Nov 2026: Trip plan (itinerary draft from votes).
-- The draft itself is computed in the app (src/itinerary.ts) from place votes + these two tables, so nothing goes stale.
-- Safe to re-run.

-- 👍 / 👎 on a stop for a specific day ("not on Saturday" ≠ "not at all")
create table if not exists public.stop_votes (
  day date not null check (day between '2026-12-26' and '2027-01-08'),
  place_id uuid not null references public.places(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (day, place_id, member_id)
);
alter table public.stop_votes enable row level security;
drop policy if exists "family reads" on public.stop_votes;
create policy "family reads" on public.stop_votes for select to authenticated using (is_family());
drop policy if exists "own vote" on public.stop_votes;
create policy "own vote" on public.stop_votes for all to authenticated
  using (is_family() and member_id = my_member()) with check (is_family() and member_id = my_member());

-- 📌 planner locks: this place goes on this day (and nowhere else)
create table if not exists public.day_pins (
  place_id uuid primary key references public.places(id) on delete cascade,
  day date not null check (day between '2026-12-26' and '2027-01-08'),
  pinned_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.day_pins enable row level security;
drop policy if exists "family reads" on public.day_pins;
create policy "family reads" on public.day_pins for select to authenticated using (is_family());
-- writes only through planner_pin() (needs the trip-planner code)

create or replace function public.planner_pin(place uuid, on_day date, code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_family() or not _check_code('admin', code) then return false; end if;
  if on_day is null then
    delete from day_pins where place_id = place;
  else
    insert into day_pins (place_id, day, pinned_by) values (place, on_day, my_member())
    on conflict (place_id) do update set day = excluded.day, pinned_by = excluded.pinned_by, created_at = now();
  end if;
  return true;
end $$;
revoke all on function public.planner_pin(uuid, date, text) from public, anon;
grant execute on function public.planner_pin(uuid, date, text) to authenticated;
grant select, insert, update, delete on public.stop_votes to authenticated;
grant select on public.day_pins to authenticated;
