# JapanFam Activity Advisor

Family Japan trip planner: halal restaurants & activities near our Osaka and Tokyo hotels, with upvotes, visited check-offs, wait times, prices and Google Maps links. React + Supabase.

## Run locally
```bash
npm install
npm run dev
```

## Database
Run `supabase/migrations/*.sql` in Supabase → SQL Editor (safe to re-run).

## Deploy
Import the repo on Vercel (framework: Vite). No env vars required — the Supabase URL and publishable key default in `src/lib.ts` (override with `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`).

Hotels: The Osaka Station Hotel · Hotel Toranomon Hills (Hyatt) · JW Marriott Hotel Tokyo.
