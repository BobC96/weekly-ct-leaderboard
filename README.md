# Weekly CT Leaderboard

Next.js + Supabase monthly Beyblade X leaderboard.

## Public page

`/` displays the latest month from the Supabase `monthly_leaderboard` view.

## Admin page

`/admin` lets the organiser create a tournament and enter the final standings. Supabase automatically calculates match points, placement points, weekly points and the monthly leaderboard using the SQL trigger/view already created in the project.

## Vercel environment variables

Set these in Vercel Project Settings > Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL` — project base URL such as `https://xxxxx.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — `sb_publishable_...`
- `SUPABASE_SECRET_KEY` — `sb_secret_...` (server-only; NEVER prefix it with NEXT_PUBLIC)
- `ADMIN_PASSWORD` — password you choose for `/admin`

After adding/changing variables, redeploy the project.

## Tables expected

- `players`
- `tournaments`
- `scoring_rules`
- `weekly_standings`
- view: `monthly_leaderboard`


## Challonge standings import

The admin page can import a public Challonge standings page without an API key. Paste a tournament URL (for example `https://challonge.com/ru2kifce`) or its `/standings` URL and click **Import Standings**. The imported data remains editable before saving. Manual entry remains available as a fallback if Challonge changes its public page markup or the tournament is private.


## Spreadsheet import
The admin page accepts Excel (.xlsx/.xls) and CSV standings files. It recognizes common Challonge-style headers including Participant/Player, Rank, Match W-L-T, W/L/T, TB, Buchholz, and Pts Diff. Imported rows are editable before saving.
