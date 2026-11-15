-- 🏆 Day leaderboard + pastel avatar backgrounds (Maryam, 15 Nov 2026)
-- avatar background: one of the app's 8 pastels
alter table public.members add column if not exists avatar_bg text;
alter table public.members drop constraint if exists members_avatar_bg_check;
alter table public.members add constraint members_avatar_bg_check check (avatar_bg is null or avatar_bg ~ '^#[0-9a-f]{6}$');

-- ❤️ hearts on a whole day = on its SET of activities (sorted ids joined by '+'), so identical days share one card
create table if not exists public.day_hearts (
  member_id uuid not null references public.members(id) on delete cascade,
  combo_key text not null check (length(combo_key) between 36 and 400),
  created_at timestamptz not null default now(),
  primary key (member_id, combo_key)
);
alter table public.day_hearts enable row level security;
drop policy if exists "family reads" on public.day_hearts;
create policy "family reads" on public.day_hearts for select to authenticated using (is_family());
drop policy if exists "own heart insert" on public.day_hearts;
create policy "own heart insert" on public.day_hearts for insert to authenticated with check (is_family() and member_id = my_member());
drop policy if exists "own heart delete" on public.day_hearts;
create policy "own heart delete" on public.day_hearts for delete to authenticated using (is_family() and member_id = my_member());

-- ✨ AI name + vibe line per activity set (written only by the day-vibe edge function with the service key)
create table if not exists public.day_vibes (
  combo_key text primary key check (length(combo_key) between 36 and 400),
  word text not null check (length(word) <= 30),
  emoji text not null check (length(emoji) <= 16),
  vibe text not null check (length(vibe) <= 120),
  created_at timestamptz not null default now()
);
alter table public.day_vibes enable row level security;
drop policy if exists "family reads" on public.day_vibes;
create policy "family reads" on public.day_vibes for select to authenticated using (is_family());

grant update (avatar_bg) on public.members to authenticated;
revoke all on public.day_hearts, public.day_vibes from anon;
grant select, insert, delete on public.day_hearts to authenticated;
grant select on public.day_vibes to authenticated;
