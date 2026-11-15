-- 🗑 Deletes with a "what this removes" confirmation (Maryam, 15 Nov 2026). Safe to re-run.
-- * delete_place: the person who added it (or a co-owner, not kids) OR a planner (code). Cleans the place out of
--   planned days + 💡 ideas (layouts too), removes ❤️ on any day set that contained it. Votes / I'm in cascade.
-- * delete_idea: the idea's owner OR a planner (code). ❤️ on that day set go too, unless another idea/plan has the same set.
-- * planner_clear_day: now also tidies ❤️ the same way.
-- * place_delete_impact: what the confirmation sheet lists.

-- day "set" key, same as comboKey() in src/itinerary.ts (sorted ids joined by '+')
create or replace function public._combo(ids uuid[]) returns text language sql immutable set search_path = public as $$
  select coalesce(string_agg(x::text, '+' order by x::text collate "C"), '') from (select distinct unnest(ids) x) s
$$;

-- drop one place id from a layout {"start":…, "steps":[["id"],["a","b"]]} keeping order, dropping empty steps
create or replace function public._strip_layout(lay jsonb, pid uuid) returns jsonb language sql immutable set search_path = public as $$
  select case when lay is null or jsonb_typeof(lay->'steps') <> 'array' then lay else jsonb_set(lay, '{steps}', coalesce((
    select jsonb_agg(g2 order by ord) from (
      select ord, (select jsonb_agg(e order by o) from jsonb_array_elements(g) with ordinality u(e, o) where e #>> '{}' <> pid::text) g2
      from jsonb_array_elements(lay->'steps') with ordinality t(g, ord)
    ) s where g2 is not null), '[]'::jsonb)) end
$$;

-- remove ❤️ on a day set once no idea or planned day has that set any more
create or replace function public._prune_hearts(k text) returns void language plpgsql security definer set search_path = public as $$
begin
  if k is null or k = '' then return; end if;
  if exists (select 1 from day_ideas where _combo(activity_ids) = k) or exists (select 1 from day_plans where _combo(activity_ids) = k) then return; end if;
  delete from day_hearts where combo_key = k;
end $$;

create or replace function public.place_delete_impact(place uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t text := place::text;
begin
  if not is_family() then return null; end if;
  return jsonb_build_object(
    'votes', (select count(*) from votes where place_id = place),
    'going', (select count(*) from attendees where place_id = place),
    'plan_days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'locked', locked,
        'empties', cardinality(array_remove(activity_ids, place)) = 0) order by day)
      from day_plans where place = any(activity_ids) or food_id = place or position(t in coalesce(layout::text, '')) > 0), '[]'::jsonb),
    'ideas', coalesce((select jsonb_agg(jsonb_build_object('member', member_id, 'hotel', hotel,
        'empties', cardinality(array_remove(activity_ids, place)) = 0))
      from day_ideas where place = any(activity_ids) or position(t in coalesce(layout::text, '')) > 0), '[]'::jsonb),
    'hearts', (select count(*) from day_hearts where position(t in combo_key) > 0)
  );
end $$;

create or replace function public.delete_place(place uuid, code text default null) returns text
language plpgsql security definer set search_path = public as $$
declare p places; me uuid := my_member(); t text := place::text; keys text[];
begin
  if not is_family() then return 'denied'; end if;
  select * into p from places where id = place;
  if not found then return 'gone'; end if;
  if not ((me is not null and (p.created_by = me or me = any(p.co_owners))
           and not exists (select 1 from members where id = me and grp = 'kid'))
          or (code is not null and _check_code('admin', code))) then return 'denied'; end if;

  -- planned days: take it out; a day with no activities left goes back to a draft
  update day_plans set activity_ids = array_remove(activity_ids, place), layout = _strip_layout(layout, place),
      food_id = nullif(food_id, place), updated_by = me, updated_at = now()
    where place = any(activity_ids) or food_id = place or position(t in coalesce(layout::text, '')) > 0;
  delete from day_plans where cardinality(activity_ids) = 0;
  -- 💡 ideas: same; an idea with nothing left is removed
  delete from day_ideas where place = any(activity_ids) and cardinality(array_remove(activity_ids, place)) = 0;
  update day_ideas set activity_ids = array_remove(activity_ids, place), layout = _strip_layout(layout, place)
    where place = any(activity_ids) or position(t in coalesce(layout::text, '')) > 0;
  -- ❤️ on any day set containing it can never come back
  delete from day_hearts where position(t in combo_key) > 0;
  delete from day_vibes where position(t in combo_key) > 0;
  delete from places where id = place; -- votes, I'm in, old day votes/pins cascade
  return 'ok';
end $$;

-- old app versions still call this: same clean-up
create or replace function public.planner_delete_place(place uuid, code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_family() or not _check_code('admin', code) then return false; end if;
  return delete_place(place, code) in ('ok', 'gone');
end $$;

create or replace function public.delete_idea(idea uuid, code text default null) returns text
language plpgsql security definer set search_path = public as $$
declare i day_ideas; k text;
begin
  if not is_family() then return 'denied'; end if;
  select * into i from day_ideas where id = idea;
  if not found then return 'gone'; end if;
  if not (i.member_id = my_member() or (code is not null and _check_code('admin', code))) then return 'denied'; end if;
  k := _combo(i.activity_ids);
  delete from day_ideas where id = idea;
  update day_plans set idea_id = null where idea_id = idea; -- a day it was placed on stays planned
  perform _prune_hearts(k);
  return 'ok';
end $$;

create or replace function public.planner_clear_day(on_day date, code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if not is_family() or not _check_code('admin', code) then return false; end if;
  select _combo(activity_ids) into k from day_plans where day = on_day;
  delete from day_plans where day = on_day;
  perform _prune_hearts(k);
  return true;
end $$;

revoke all on function public._combo(uuid[]), public._strip_layout(jsonb, uuid), public._prune_hearts(text) from public, anon, authenticated;
revoke all on function public.place_delete_impact(uuid), public.delete_place(uuid, text), public.delete_idea(uuid, text),
  public.planner_delete_place(uuid, text), public.planner_clear_day(date, text) from public, anon;
grant execute on function public.place_delete_impact(uuid), public.delete_place(uuid, text), public.delete_idea(uuid, text),
  public.planner_delete_place(uuid, text), public.planner_clear_day(date, text) to authenticated;
