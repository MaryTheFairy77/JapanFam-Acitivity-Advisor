-- "Do" tab now has just two sub-tabs: 🎢 activity | 🛍 shopping. Old categories (food/fun/culture/nature) → activity. Safe to re-run.
alter table public.places drop constraint if exists places_category;
update public.places set category = 'activity' where kind = 'activity' and (category is null or category <> 'shopping');
update public.places set category = null where kind = 'restaurant';
alter table public.places add constraint places_category check (category is null or category in ('shopping','activity'));
