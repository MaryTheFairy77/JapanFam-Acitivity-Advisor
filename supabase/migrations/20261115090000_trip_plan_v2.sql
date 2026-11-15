-- 15 Nov 2026: Trip plan v2 (see project doc claude/trip-plan-v2-spec.md). Safe to re-run.
-- day_plans: a planner-set day (activities in order, optional food choice, locked or not). Days without a row = faded draft.
-- day_ideas: "💡 Suggest a day": one idea per person per hotel. Score = sum of normal place votes (computed in the app).
-- Old stop_votes / day_pins are no longer used by the app (kept, harmless).

create table if not exists public.day_plans (
  day date primary key check (day between '2026-12-26' and '2027-01-08'),
  activity_ids uuid[] not null default '{}' check (cardinality(activity_ids) <= 4),
  food_id uuid references public.places(id) on delete set null,
  locked boolean not null default false,
  idea_id uuid,
  updated_by uuid references public.members(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.day_plans enable row level security;
drop policy if exists "family reads" on public.day_plans;
create policy "family reads" on public.day_plans for select to authenticated using (is_family());
grant select on public.day_plans to authenticated;

create table if not exists public.day_ideas (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  hotel text not null check (hotel in ('toranomon', 'osaka', 'jw_tokyo')),
  half_day boolean not null default false,
  activity_ids uuid[] not null check (cardinality(activity_ids) between 1 and 3),
  created_at timestamptz not null default now(),
  unique (member_id, hotel)
);
alter table public.day_ideas enable row level security;
drop policy if exists "family reads" on public.day_ideas;
create policy "family reads" on public.day_ideas for select to authenticated using (is_family());
drop policy if exists "own idea" on public.day_ideas;
create policy "own idea" on public.day_ideas for all to authenticated
  using (is_family() and member_id = my_member()) with check (is_family() and member_id = my_member());
grant select, insert, update, delete on public.day_ideas to authenticated;

-- planners only (trip-planner code): set / lock / clear a day
create or replace function public.planner_set_day(on_day date, acts uuid[], food uuid, lock boolean, idea uuid, code text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not is_family() or not _check_code('admin', code) then return false; end if;
  insert into day_plans (day, activity_ids, food_id, locked, idea_id, updated_by, updated_at)
  values (on_day, coalesce(acts, '{}'), food, coalesce(lock, false), idea, my_member(), now())
  on conflict (day) do update set activity_ids = excluded.activity_ids, food_id = excluded.food_id,
    locked = excluded.locked, idea_id = excluded.idea_id, updated_by = excluded.updated_by, updated_at = now();
  return true;
end $$;
create or replace function public.planner_clear_day(on_day date, code text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not is_family() or not _check_code('admin', code) then return false; end if;
  delete from day_plans where day = on_day;
  return true;
end $$;
revoke all on function public.planner_set_day(date, uuid[], uuid, boolean, uuid, text) from public, anon;
revoke all on function public.planner_clear_day(date, text) from public, anon;
grant execute on function public.planner_set_day(date, uuid[], uuid, boolean, uuid, text) to authenticated;
grant execute on function public.planner_clear_day(date, text) to authenticated;
