-- longer AI description for the day popup (Maryam, 15 Nov 2026)
alter table public.day_vibes add column if not exists story text check (story is null or length(story) <= 600);
