import { createClient } from '@/lib/supabase/server'
import LeaderboardTabs from './components/LeaderboardTabs'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('monthly_leaderboard')
    .select('*')
    .order('leaderboard_month', { ascending: false })
    .order('monthly_points', { ascending: false })
    .order('total_wins', { ascending: false })
    .order('total_point_diff', { ascending: false })
    .order('best_placement', { ascending: true })

  const latestMonth = data?.[0]?.leaderboard_month
  const rows = (data ?? []).filter(r => r.leaderboard_month === latestMonth)
  const title = latestMonth
    ? new Date(latestMonth + 'T00:00:00').toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })
    : 'Current Month'

  let totalEvents = 0
  if (latestMonth) {
    const start = new Date(latestMonth + 'T00:00:00Z')
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
    const endDate = end.toISOString().slice(0, 10)
    const { count } = await supabase
      .from('tournaments')
      .select('id', { count: 'exact', head: true })
      .gte('tournament_date', latestMonth)
      .lt('tournament_date', endDate)
    totalEvents = count ?? 0
  }

  return <main>
    <section className="hero">
      <div className="eyebrow">BEYBLADE X COMMUNITY TOURNAMENT</div>
      <h1>SGBEYLION CT</h1>
      <p>{title} Season</p>
    </section>

    {error ? (
      <section className="card emptyState"><p>Unable to load rankings. Check Supabase environment variables and RLS.</p></section>
    ) : rows.length === 0 ? (
      <section className="card emptyState"><p>No tournament results yet.</p><span>Upload your first CT standings from the admin page.</span></section>
    ) : (
      <LeaderboardTabs rows={rows as any} totalEvents={totalEvents} />
    )}

    <footer>SGBEYLION League · Monthly Rankings & Attendance</footer>
  </main>
}
