-- Security hardening. Paste into SQL Editor → Run. Safe to re-run.
-- ⬇ Change the TRIP-PLANNER code on the marked line below (different from the family code; only planners get it).

-- ───────────── 1. Clean deletes (no orphan votes / attendees) ─────────────
alter table public.votes drop constraint if exists votes_member_id_fkey,
  add constraint votes_member_id_fkey foreign key (member_id) references public.members(id) on delete cascade;
alter table public.votes drop constraint if exists votes_place_id_fkey,
  add constraint votes_place_id_fkey foreign key (place_id) references public.places(id) on delete cascade;
alter table public.attendees drop constraint if exists attendees_member_id_fkey,
  add constraint attendees_member_id_fkey foreign key (member_id) references public.members(id) on delete cascade;
alter table public.attendees drop constraint if exists attendees_place_id_fkey,
  add constraint attendees_place_id_fkey foreign key (place_id) references public.places(id) on delete cascade;
alter table public.places drop constraint if exists places_created_by_fkey,
  add constraint places_created_by_fkey foreign key (created_by) references public.members(id) on delete set null;

-- ───────────── 2. Input limits (stops junk / malicious data at the source) ─────────────
alter table public.places
  drop constraint if exists places_name_len,      add constraint places_name_len      check (char_length(name) between 1 and 120),
  drop constraint if exists places_desc_len,      add constraint places_desc_len      check (description is null or char_length(description) <= 500),
  drop constraint if exists places_text_len,      add constraint places_text_len      check (coalesce(char_length(travel_text),0) <= 200 and coalesce(char_length(wait_text),0) <= 200 and coalesce(char_length(long_line),0) <= 300),
  drop constraint if exists places_price_range,   add constraint places_price_range   check (price_jpy is null or price_jpy between 0 and 10000000),
  drop constraint if exists places_minutes_range, add constraint places_minutes_range check (coalesce(travel_minutes,0) between 0 and 1440 and coalesce(wait_minutes,0) between 0 and 1440 and coalesce(visit_minutes,0) between 0 and 1440),
  drop constraint if exists places_coords,        add constraint places_coords        check ((lat is null or lat between -90 and 90) and (lng is null or lng between -180 and 180)),
  drop constraint if exists places_halal,         add constraint places_halal         check (halal is null or halal in ('Halal certified','Muslim friendly','Pork-free','Not halal','Unknown')),
  drop constraint if exists places_hotels,        add constraint places_hotels        check (nearest_hotels <@ array['osaka','toranomon','jw_tokyo']::text[]),
  -- only plain web links: blocks javascript:/data: links that could run code when tapped
  drop constraint if exists places_urls,          add constraint places_urls          check (
    (maps_url is null or (maps_url ~* '^https?://' and char_length(maps_url) <= 2000)) and
    (website_url is null or (website_url ~* '^https?://' and char_length(website_url) <= 2000)));

alter table public.members
  drop constraint if exists members_nickname_len, add constraint members_nickname_len check (nickname is null or char_length(nickname) between 1 and 20),
  drop constraint if exists members_emoji_len,    add constraint members_emoji_len    check (char_length(emoji) between 1 and 16),
  drop constraint if exists members_name_len,     add constraint members_name_len     check (char_length(name) between 1 and 40);

-- ───────────── 3. Members: phones may only change nickname + avatar ─────────────
revoke insert, update, delete on public.members from authenticated;
grant update (nickname, emoji) on public.members to authenticated;

-- ───────────── 4. Trip-planner code (deleting places, adding people) ─────────────
create table if not exists public.admin_secret (id int primary key default 1 check (id = 1), code_hash text not null);
alter table public.admin_secret enable row level security;
revoke all on public.admin_secret from anon, authenticated;

-- ⬇⬇⬇ CHANGE 'planner-change-me' TO YOUR TRIP-PLANNER CODE ⬇⬇⬇
insert into public.admin_secret (id, code_hash) values (1, extensions.crypt('planner-change-me', extensions.gen_salt('bf')))
on conflict (id) do update set code_hash = excluded.code_hash;

-- ───────────── 5. Lockout after repeated wrong codes ─────────────
create table if not exists public.code_attempts (
  uid uuid not null, kind text not null, fails int not null default 0, locked_until timestamptz,
  primary key (uid, kind)
);
alter table public.code_attempts enable row level security;
revoke all on public.code_attempts from anon, authenticated;

-- returns true if the code matches; counts failures, locks for 15 min after 5 wrong tries
create or replace function public._check_code(p_kind text, p_code text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean; v_locked timestamptz;
begin
  if auth.uid() is null then return false; end if;
  select a.locked_until into v_locked from code_attempts a where a.uid = auth.uid() and a.kind = p_kind;
  if v_locked is not null and v_locked > now() then
    raise exception 'Too many wrong tries. Wait 15 minutes.';
  end if;
  if p_kind = 'family' then
    select exists (select 1 from family_secret s where s.code_hash = crypt(trim(p_code), s.code_hash) or s.code_hash = crypt(lower(trim(p_code)), s.code_hash)) into ok;
  else
    select exists (select 1 from admin_secret s where s.code_hash = crypt(trim(p_code), s.code_hash)) into ok;
  end if;
  if ok then
    delete from code_attempts a where a.uid = auth.uid() and a.kind = p_kind;
  else
    insert into code_attempts as a (uid, kind, fails) values (auth.uid(), p_kind, 1)
    on conflict on constraint code_attempts_pkey do update set fails = a.fails + 1,
      locked_until = case when a.fails + 1 >= 5 then now() + interval '15 minutes' else null end;
    perform pg_sleep(1);
  end if;
  return ok;
end $$;
revoke all on function public._check_code(text, text) from public, anon, authenticated;

create or replace function public.join_family(code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not _check_code('family', code) then return false; end if;
  insert into family_access (uid) values (auth.uid()) on conflict do nothing;
  return true;
end $$;

create or replace function public.check_planner(code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_family() then return false; end if;
  return _check_code('admin', code);
end $$;

-- Deleting places now ONLY works through this function (needs the planner code)
revoke delete on public.places from authenticated;
create or replace function public.planner_delete_place(place uuid, code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_family() or not _check_code('admin', code) then return false; end if;
  delete from places where id = place;
  return true;
end $$;

create or replace function public.planner_add_member(member_name text, member_grp text, member_emoji text, code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not is_family() or not _check_code('admin', code) then return null; end if;
  insert into members (name, grp, emoji) values (trim(member_name), member_grp, coalesce(nullif(member_emoji, ''), '🙂'))
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.join_family(text), public.check_planner(text),
  public.planner_delete_place(uuid, text), public.planner_add_member(text, text, text, text) from public, anon;
grant execute on function public.join_family(text), public.check_planner(text),
  public.planner_delete_place(uuid, text), public.planner_add_member(text, text, text, text) to authenticated;
