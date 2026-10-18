-- Family-only access, fixed family logins, "who's going", website links.
-- BEFORE RUNNING: Supabase → Authentication → Sign In / Providers → turn ON "Allow anonymous sign-ins".
-- Then change the family code on the marked line below, paste everything into SQL Editor → Run.

-- ───────────── 1. Members: groups, nicknames, admins ─────────────
alter table public.members add column if not exists nickname text;
alter table public.members add column if not exists grp text not null default 'adult';
alter table public.members add column if not exists is_admin boolean not null default false;
do $$ begin
  alter table public.members add constraint members_grp_check check (grp in ('adult','teen','kid'));
exception when duplicate_object then null; end $$;

insert into public.members (name, grp, emoji, is_admin) values
  ('Khadeeja','adult','🌸',true), ('Imraan','adult','🗻',true), ('Majedi','adult','🍵',false),
  ('Shaheda','adult','🎎',false), ('Taufiq','adult','🦊',false), ('Zurina','adult','🌺',false),
  ('Latiefa','adult','🍡',false), ('Naasir','adult','🐉',false), ('Yumna','adult','🌙',false),
  ('Ihsaan','adult','⛩️',false), ('Surbhi','adult','🪷',false),
  ('Haroon','teen','🎮',false), ('Maryam','teen','🍣',true), ('Ayesha','teen','🐱',false),
  ('Yahya','teen','🦖',false),
  ('Ziya','kid','🐼',false), ('Burooj','kid','🐰',false), ('Yusra','kid','🐥',false)
on conflict (name) do update set grp = excluded.grp, is_admin = excluded.is_admin;

-- Optional: remove test logins made earlier (uncomment + edit the name)
-- delete from public.members where name = 'Mary';

-- ───────────── 2. Places: website link ─────────────
alter table public.places add column if not exists website_url text;

-- ───────────── 3. Who's going ─────────────
create table if not exists public.attendees (
  member_id uuid not null references public.members(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, place_id)
);

-- ───────────── 4. Family code gate ─────────────
create table if not exists public.family_secret (id int primary key default 1 check (id = 1), code_hash text not null);
create table if not exists public.family_access (uid uuid primary key, joined_at timestamptz not null default now());
alter table public.family_secret enable row level security;  -- no policies = nobody can read it via the API
alter table public.family_access enable row level security;
revoke all on public.family_secret, public.family_access from anon, authenticated;

-- ⬇⬇⬇ CHANGE 'sakura-2026' TO YOUR FAMILY CODE (only the hash is stored) ⬇⬇⬇
insert into public.family_secret (id, code_hash) values (1, extensions.crypt('sakura-2026', extensions.gen_salt('bf')))
on conflict (id) do update set code_hash = excluded.code_hash;

create or replace function public.join_family(code text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from family_secret where code_hash = crypt(lower(trim(code)), code_hash))
     or exists (select 1 from family_secret where code_hash = crypt(trim(code), code_hash)) then
    insert into family_access (uid) values (auth.uid()) on conflict do nothing;
    return true;
  end if;
  perform pg_sleep(1); -- slow down guessing
  return false;
end $$;

create or replace function public.is_family() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_access where uid = auth.uid())
$$;

revoke all on function public.join_family(text), public.is_family() from public, anon;
grant execute on function public.join_family(text), public.is_family() to authenticated;

-- ───────────── 5. Lock the app tables to family devices only ─────────────
alter table public.attendees enable row level security;
do $$
declare t text;
begin
  foreach t in array array['members','places','votes','attendees'] loop
    execute format('drop policy if exists "family all" on public.%I', t);
    execute format('drop policy if exists "family only" on public.%I', t);
    execute format('create policy "family only" on public.%I for all to authenticated using (public.is_family()) with check (public.is_family())', t);
  end loop;
end $$;

revoke all on public.members, public.places, public.votes, public.attendees from anon;
grant select, insert, update, delete on public.members, public.places, public.votes, public.attendees to authenticated;
