-- 📍 Branches (Maryam, 17 Nov 2026): one place card (one set of votes) can have several locations, e.g. "ROUND1 (Tokyo)".
-- lat/lng stay the branch closest to a hotel (travel, nearest hotel and the trip planner use it); every branch gets a map pin.
-- Each item: {"lat": 34.70, "lng": 135.50, "area": "Kita Ward"}. Also re-applies 20261115160000 (creator-only delete).
alter table public.places add column if not exists branches jsonb;
alter table public.places drop constraint if exists places_branches_ok;
alter table public.places add constraint places_branches_ok check (branches is null or (jsonb_typeof(branches) = 'array' and jsonb_array_length(branches) <= 40 and length(branches::text) <= 8000));

create or replace function public._delete_place_cleanup(place uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t text := place::text;
begin
  update day_plans set activity_ids = array_remove(activity_ids, place), layout = _strip_layout(layout, place),
      food_id = nullif(food_id, place), updated_at = now()
    where place = any(activity_ids) or food_id = place or position(t in coalesce(layout::text, '')) > 0;
  delete from day_plans where cardinality(activity_ids) = 0;
  delete from day_ideas where place = any(activity_ids) and cardinality(array_remove(activity_ids, place)) = 0;
  update day_ideas set activity_ids = array_remove(activity_ids, place), layout = _strip_layout(layout, place)
    where place = any(activity_ids) or position(t in coalesce(layout::text, '')) > 0;
  delete from day_hearts where position(t in combo_key) > 0;
  delete from day_vibes where position(t in combo_key) > 0;
  delete from places where id = place; -- votes, I'm in, old day votes/pins cascade
end $$;

create or replace function public.delete_place(place uuid, code text default null) returns text
language plpgsql security definer set search_path = public as $$
declare p places; me uuid := my_member();
begin
  if not is_family() or me is null then return 'denied'; end if;
  select * into p from places where id = place;
  if not found then return 'gone'; end if;
  if p.created_by is distinct from me or exists (select 1 from members where id = me and grp = 'kid') then return 'denied'; end if;
  perform _delete_place_cleanup(place);
  return 'ok';
end $$;

create or replace function public.planner_delete_place(place uuid, code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  return false;
end $$;

create or replace function public.admin_delete_place(place uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from places where id = place) then return 'gone'; end if;
  perform _delete_place_cleanup(place);
  return 'ok';
end $$;

revoke all on function public._delete_place_cleanup(uuid), public.admin_delete_place(uuid) from public, anon, authenticated;
revoke all on function public.delete_place(uuid, text), public.planner_delete_place(uuid, text) from public, anon;
grant execute on function public.delete_place(uuid, text), public.planner_delete_place(uuid, text) to authenticated;
