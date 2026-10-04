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
- `ADMIN_SESSION_SECRET` (at least 32 characters; generate a random 64-character value)

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


## Security-patched framework

This build pins Next.js to 15.5.24, the patched 15.x Maintenance LTS release for the August 2026 security update.


## Public rankings UI update

The Monthly Rankings table hides Point Differential from the public table. Point Differential remains stored in Supabase. A `?` beside the Points heading explains match points, placement bonuses, weekly score, and monthly score on hover/focus/tap.

## Admin security hardening

Admin cookies are signed with HMAC-SHA256 and verified on the server, with an
8-hour expiry. A password or session-secret change invalidates existing sessions.
Legacy password-hash cookies are rejected; admins must sign in again after deployment.

- Configure ADMIN_PASSWORD and ADMIN_SESSION_SECRET for both Production and Preview.
- Store both as Secret variables in Vercel. Use different random session secrets
  for Production and Preview. Never commit their values.
- Cookies are HttpOnly, SameSite=Strict, and Secure in production builds.
- All admin POST endpoints require an Origin matching the request URL.
- JSON endpoints enforce content type and streaming byte limits (4 KiB for login,
  claims, and URL import; 1 MiB for tournament saves).
- Login uses a constant-time comparison of password digests.
- Basic login throttling allows five attempts per 15 minutes per client per
  server instance, including successful attempts. It uses Vercel's overwritten
  x-vercel-forwarded-for header on Vercel; local development shares one bucket.
  This is not distributed protection and resets on instance restart. Configure
  a Vercel Firewall/WAF rate limit for /api/admin/login as an additional layer.
- Saves validate dates, names, duplicates, numeric values and optional HTTPS
  Challonge URLs. Limits: 1000 players, 200 characters per name, numeric magnitude
  up to 1,000,000; tiebreak/Buchholz accept half steps and signed differentials
  remain supported. Explicit score fields are rejected; database triggers own scores.
- URL imports refuse redirects and time out after 15 seconds. If Challonge redirects
  a public URL, use its final HTTPS URL or upload the spreadsheet instead.

### Verification and rollout

Run `npm test`, `npm run typecheck`, and `npm run build`.
Tests use simulated cookies and database responses, never the live database.
The build requires Supabase URL/publishable-key variables; placeholder values
can be used for compilation because application pages are dynamic.

Review the pull request and its Vercel Preview before merging into main.
Preview may share the production database: use login/logout checks only unless
a separate test database has been configured. Confirm the claims-review link
appears after login, and that a fresh login is required after logout.

Keep the Supabase server secret out of browser code.

## Duplicate tournament uploads

The database index `tournaments_unique_name_date` enforces one event per date and
name, ignoring letter case and surrounding spaces. The owner applied it in
Supabase on 2026-10-04; `docs/tournament-uniqueness.sql` records its definition for
new databases. Do not rerun it on the existing production database.

The save API returns HTTP 409 with `DUPLICATE_TOURNAMENT` for a conflict on this
specific index. The admin form displays the message and preserves the entered
rows. Unrelated database errors retain their existing error handling.

This is duplicate blocking, not an atomic or idempotent save. If a network
response is lost, check the existing tournament before retrying: it may be fully
saved or may lack standings. A rejected duplicate does not overwrite or delete
the existing tournament. Player creation happens before the tournament insert,
so an unsuccessful upload can still leave newly created player records.
