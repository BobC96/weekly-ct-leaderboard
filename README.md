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
