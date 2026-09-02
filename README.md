# SGBEYLION League

Beyblade X monthly rankings + attendance tracker for SGBEYLION CT.

Target Vercel address: `https://sgbeylion-league.vercel.app`

## Public site

The homepage has two tabs:

- **Monthly Rankings** — uses the existing `monthly_leaderboard` view and the agreed scoring system.
- **Attendance** — automatically counts how many CT tournaments each blader attended during the month.

No separate attendance entry is required. Every blader saved from an uploaded CT Excel/CSV standings file counts as attending that tournament.

## Admin

Open `/admin` to:

1. Enter tournament name + date.
2. Optionally save the Challonge URL as a reference.
3. Upload the Challonge Excel/CSV standings export.
4. Review/edit Player, Rank, W, L, T, TB, Buchholz and Diff.
5. Save the tournament.

Saving results updates both monthly rankings and attendance automatically.

## Vercel environment variables

Keep the same four variables already used by the existing deployment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `ADMIN_PASSWORD`

The Challonge API variables are not required for the Excel workflow.

## Supabase requirements

Existing tables/view:

- `players`
- `tournaments`
- `scoring_rules`
- `weekly_standings`
- `monthly_leaderboard`

Attendance uses `monthly_leaderboard.tournaments_played`, which already counts distinct tournaments per blader, so no new table or view is needed.

## Rename Vercel address

In Vercel, rename the project to `sgbeylion-league` under Project Settings. If `sgbeylion-league.vercel.app` is available, Vercel will use that project domain. If the old deployment URL remains, add/assign the new project domain from the Domains section.
