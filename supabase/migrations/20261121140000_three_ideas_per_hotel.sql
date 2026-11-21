-- 21 Nov 2026: up to 3 day ideas per person per hotel (was 1).
-- Add-only for data: existing ideas become slot 1; nothing is rewritten or removed.
alter table public.day_ideas add column if not exists slot smallint not null default 1;
alter table public.day_ideas add constraint day_ideas_slot_range check (slot between 1 and 3);
alter table public.day_ideas drop constraint if exists day_ideas_member_id_hotel_key;
alter table public.day_ideas add constraint day_ideas_member_hotel_slot_key unique (member_id, hotel, slot);
