-- JapanFam Activity Advisor: initial schema + seed
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.

create extension if not exists pgcrypto;

-- Family members (no passwords; click-to-login)
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  emoji text not null default '🙂',
  created_at timestamptz not null default now()
);

-- Restaurants + activities in one table
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('restaurant','activity')),
  name text not null,
  description text,
  price_jpy integer,                 -- price per person in yen
  halal text,                        -- restaurants: Halal certified / Muslim friendly / Pork-free / Not halal / Unknown
  nearest_hotels text[] not null default '{}', -- osaka | toranomon | jw_tokyo
  travel_text text,                  -- e.g. "1 hr 42 min drive"
  travel_minutes integer,            -- for sorting
  wait_text text,                    -- e.g. "~60-90 min"
  wait_minutes integer,              -- for sorting
  long_line text,                    -- notes on queues
  taste text check (taste in ('sweet','savory','both')), -- restaurants
  maps_url text,
  visited boolean not null default false,
  visited_at timestamptz,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

-- One upvote per member per place
create table if not exists public.votes (
  member_id uuid not null references public.members(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, place_id)
);

-- Open family access (no auth): RLS on, everything allowed for anon key
alter table public.members enable row level security;
alter table public.places  enable row level security;
alter table public.votes   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['members','places','votes'] loop
    execute format('drop policy if exists "family all" on public.%I', t);
    execute format('create policy "family all" on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

grant select, insert, update, delete on public.members, public.places, public.votes to anon, authenticated;

-- Seed: activities from Family planning.xlsx (only if table empty)
insert into public.places (kind, name, description, price_jpy, nearest_hotels, travel_text, travel_minutes, wait_text, wait_minutes, long_line, maps_url)
select * from (values
  ('activity','Fuji Go Q tours & glamping','Go kart and mini car riding',37500, array['toranomon','jw_tokyo'],'1 hr 42 min drive',102,'Prebooked',0,'No','https://maps.app.goo.gl/BeZZH7N34cqjtwTj7'),
  ('activity','Kiyomizudera temple','Sword lifting',500, array['osaka'],'1 hr drive',60,'Requires a hike to reach it',null,'No','https://maps.app.goo.gl/vLLgrh9qy9m6P22CA'),
  ('activity','Sanrio Puroland','Hello Kitty amusement park',4500, array['toranomon','jw_tokyo'],'45 min drive',45,'10–30 min',20,'Potentially – go during the week + reservation recommended','https://maps.app.goo.gl/eeeWWEbCngMMZppz8'),
  ('activity','Super Nintendo World','Nintendo amusement park',9000, array['osaka'],'20 min drive',20,'~60–90 min',75,'Around R900 for a day pass; many rides ~1 hr wait','https://maps.app.goo.gl/yKnb4NVz8inDkpMi8'),
  ('activity','Art Aquarium Museum','Really cool futuristic aquarium',2500, array['toranomon'],'10 min drive',10,'~40 min walkthrough',null,'No – kids free and web tickets cheaper','https://maps.app.goo.gl/1UZL6RZYsrSyDMi57')
) as v
where not exists (select 1 from public.places);
