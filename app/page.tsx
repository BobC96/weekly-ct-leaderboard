import { createClient } from '@/lib/supabase/server'

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
  const title = latestMonth ? new Date(latestMonth + 'T00:00:00').toLocaleDateString('en-SG',{month:'long',year:'numeric'}) : 'Current Month'

  return <main>
    <section className="hero"><div className="eyebrow">BEYBLADE X</div><h1>Weekly CT</h1><p>{title} Leaderboard</p></section>
    <section className="card">
      {error ? <p>Unable to load leaderboard. Check Supabase environment variables and RLS.</p> : rows.length === 0 ? <p>No tournament results yet.</p> :
      <div className="tableWrap"><table><thead><tr><th>#</th><th>Blader</th><th>Events</th><th>W-L-T</th><th>Diff</th><th>Points</th></tr></thead><tbody>
      {rows.map((r:any,i:number)=><tr key={r.player_id}><td className="rank">{i+1}</td><td>{r.player_name}</td><td>{r.tournaments_played}</td><td>{r.total_wins}-{r.total_losses}-{r.total_ties}</td><td>{r.total_point_diff>0?'+':''}{r.total_point_diff}</td><td className="points">{r.monthly_points}</td></tr>)}
      </tbody></table></div>}
    </section>
    <footer>Weekly CT Monthly Rankings</footer>
  </main>
}
