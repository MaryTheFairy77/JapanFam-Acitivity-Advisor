-- Co-owners: when two people suggest overlapping ideas, both get credit + edit rights on a place.
-- Safe to re-run.
alter table public.places add column if not exists co_owners uuid[] not null default '{}';
alter table public.places drop constraint if exists places_co_owners_len,
  add constraint places_co_owners_len check (cardinality(co_owners) <= 10);

-- creator OR a co-owner can edit directly (planners still go through planner_update_place)
drop policy if exists "creator edits place" on public.places;
create policy "creator edits place" on public.places for update to authenticated
  using (public.is_family() and created_by is not null and (created_by = public.my_member() or public.my_member() = any(co_owners)))
  with check (public.is_family() and (created_by = public.my_member() or public.my_member() = any(co_owners)));

-- ownership (created_by / co_owners) can only be changed by SQL run by Claude/Maryam, never from the app
create or replace function public.places_lock_owners() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.co_owners := '{}';
    elsif new.created_by is distinct from old.created_by or new.co_owners is distinct from old.co_owners then
      raise exception 'Only a trip planner can change who owns a place';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists places_lock_owners on public.places;
create trigger places_lock_owners before insert or update on public.places
  for each row execute function public.places_lock_owners();
