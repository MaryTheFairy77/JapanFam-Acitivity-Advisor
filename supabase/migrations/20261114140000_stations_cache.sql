-- 14 Nov 2026: stations near our hotels + places, fetched by the "stations" edge function (OpenStreetMap)
-- and saved here so phones don't hit Overpass directly (it blocks browsers when busy). Safe to re-run.
create table if not exists public.stations_cache (
  id int primary key check (id = 1),
  sig text not null,
  data jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table public.stations_cache enable row level security;
drop policy if exists "family reads" on public.stations_cache;
create policy "family reads" on public.stations_cache for select to authenticated using (is_family());
grant select on public.stations_cache to authenticated;
-- writes: only the edge function (service role)
