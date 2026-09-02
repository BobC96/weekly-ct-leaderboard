# SGBEYLION League

SGBEYLION CT monthly Beyblade X rankings + attendance tracker.

Target Vercel address: `https://sgbeylion-league.vercel.app`

## Current workflow

1. Open `/admin` and log in.
2. Enter the SGBEYLION CT tournament name and date.
3. Upload the Challonge Excel/CSV standings export.
4. Review Player, Rank, W, L, T, TB, Buchholz and Diff.
5. Save the tournament.
6. Each saved blader counts as attending that CT automatically.
7. The public page provides **Monthly Rankings** and **Attendance** tabs.

## Required Vercel variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `ADMIN_PASSWORD`

`NEXT_PUBLIC_SUPABASE_URL` may be entered as the project URL. The server save code also safely strips an accidental `/rest/v1` suffix.

## Stable save implementation

Version 1.1 uses direct server-side Supabase PostgREST requests for admin writes instead of routing tournament saves through `@supabase/supabase-js`.

It:

- reads existing players once;
- creates only missing players in one batch;
- refreshes player IDs once;
- inserts one tournament;
- inserts all standings in one batch;
- rolls the tournament back if the standings insert fails;
- retries transient network failures;
- returns the exact failing stage and HTTP/network detail.

The public rankings page still uses the Supabase SSR client for read-only queries.

## Pinned dependencies

Top-level framework/library dependencies are exact versions in `package.json` rather than `latest`, preventing future Vercel deploys from silently changing them.

## Supabase objects expected

- `players`
- `tournaments`
- `scoring_rules`
- `weekly_standings`
- `monthly_leaderboard` view

The existing `calculate_weekly_points()` trigger continues to calculate weekly points when standings are inserted.
