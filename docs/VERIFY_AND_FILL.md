# JapanFam: "Verify & fill" pass (run by Claude in chat)

The app never calls Claude. This is an optional, manual pass where Claude (connected to Supabase project
`bbquqkxsggzzbzocsias` via the Supabase connector) researches places on the web and fills **blank** fields.
If Claude isn't available, nothing changes in the app.

## How to start it
In a Claude chat with the Supabase connector enabled, say:

> Run the JapanFam verify & fill pass (see docs/VERIFY_AND_FILL.md in the project).

## Rules Claude must follow
1. **Read first:** `select id, kind, name, description, price_jpy, halal, wait_minutes, wait_text, website_url, lat, lng, nearest_hotels, auto_fields, auto_sources from public.places order by created_at;`
2. **Only fill blanks.** A field counts as blank if it is `null` (or `halal = 'Unknown'`).
   **Never overwrite** a value a person entered. A value may be refreshed only if its key is already in `auto_fields`.
3. **Research each place on the web** (official site first, then reputable guides). Fill only what you can source:
   - `price_jpy`: typical price per adult in yen (integer, 0–10,000,000). Add `'price'` to `auto_fields`.
   - `wait_minutes` (0–1440) + short `wait_text` (≤200 chars, e.g. "30–60 min at weekends"). Add `'wait'`.
   - `halal` (restaurants only): one of `Halal certified`, `Muslim friendly`, `Pork-free`, `Not halal`. Add `'halal'`. Be conservative: only "Halal certified" with clear evidence of certification.
   - `website_url` (must start with https://). Add `'website_url'`.
   - `lat`/`lng` if missing (add `'pin'`); don't change `nearest_hotels`/`travel_*` (the app computes those).
4. **Record sources:** append the URLs used to `auto_sources` (space-separated, total ≤1500 chars).
5. **Write with one UPDATE per place**, e.g.
   ```sql
   update public.places
   set price_jpy = 4500, wait_minutes = 20, wait_text = '10–30 min, weekdays quieter',
       auto_fields = (select array(select distinct unnest(auto_fields || array['price','wait']))),
       auto_sources = trim(coalesce(auto_sources,'') || ' https://example.jp/tickets')
   where id = '…' and price_jpy is null;
   ```
6. **Show the user a summary table** (place → what was filled → source) and **ask before writing**.
7. Never touch `members`, `votes`, `attendees`, codes/secrets, or delete anything.

## In the app
Filled values show **yellow ✨ "found online"** with the source links in the place's details. When anyone types over
a yellow value it becomes a confirmed value (the ✨ disappears).
