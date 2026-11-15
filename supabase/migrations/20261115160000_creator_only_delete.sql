-- Places: ONLY the person who added it can delete it in the app (Maryam, 15 Nov 2026). Safe to re-run.
-- Planners / co-owners can't delete from the app any more. Maryam deletes anything from the Supabase SQL editor:
--   select public.admin_delete_place('<place uuid>');
-- (find the id: select id, name from places where name ilike '%pork%';)

-- the clean-up itself (internal: not callable from the app)
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

-- app: creator only (not kids). code is ignored (kept so the app's call shape stays the same)
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

-- old app versions: planners can no longer delete places from the app
create or replace function public.planner_delete_place(place uuid, code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  return false;
end $$;

-- Maryam / Claude only, from the SQL editor (no grant to the app's roles)
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
