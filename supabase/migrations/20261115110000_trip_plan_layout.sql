-- 15 Nov 2026: free-form day layout: {"start": minutes, "steps": [["placeId"], ["kimonoId","templeId"], ...]} (inner arrays = done together)
-- Applied to production 15 Nov. Safe to re-run.
alter table public.day_plans add column if not exists layout jsonb;
alter table public.day_ideas add column if not exists layout jsonb;
alter table public.day_plans drop constraint if exists day_plans_activity_ids_check;
alter table public.day_plans add constraint day_plans_activity_ids_check check (cardinality(activity_ids) <= 10);
alter table public.day_ideas drop constraint if exists day_ideas_activity_ids_check;
alter table public.day_ideas add constraint day_ideas_activity_ids_check check (cardinality(activity_ids) between 1 and 10);
alter table public.day_plans drop constraint if exists day_plans_layout_size;
alter table public.day_plans add constraint day_plans_layout_size check (layout is null or pg_column_size(layout) < 4000);
alter table public.day_ideas drop constraint if exists day_ideas_layout_size;
alter table public.day_ideas add constraint day_ideas_layout_size check (layout is null or pg_column_size(layout) < 4000);

create or replace function public.planner_set_layout(on_day date, acts uuid[], lay jsonb, lock boolean, idea uuid, code text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not is_family() or not _check_code('admin', code) then return false; end if;
  insert into day_plans (day, activity_ids, layout, food_id, locked, idea_id, updated_by, updated_at)
  values (on_day, coalesce(acts, '{}'), lay, null, coalesce(lock, false), idea, my_member(), now())
  on conflict (day) do update set activity_ids = excluded.activity_ids, layout = excluded.layout, food_id = null,
    locked = excluded.locked, idea_id = excluded.idea_id, updated_by = excluded.updated_by, updated_at = now();
  return true;
end $$;
create or replace function public.planner_lock_day(on_day date, lock boolean, code text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not is_family() or not _check_code('admin', code) then return false; end if;
  update day_plans set locked = lock, updated_by = my_member(), updated_at = now() where day = on_day;
  return found;
end $$;
revoke all on function public.planner_set_layout(date, uuid[], jsonb, boolean, uuid, text) from public, anon;
revoke all on function public.planner_lock_day(date, boolean, text) from public, anon;
grant execute on function public.planner_set_layout(date, uuid[], jsonb, boolean, uuid, text) to authenticated;
grant execute on function public.planner_lock_day(date, boolean, text) to authenticated;
