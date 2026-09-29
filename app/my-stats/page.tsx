import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AccountActions from './AccountActions'
import ClaimPlayerForm from './ClaimPlayerForm'

export const dynamic = 'force-dynamic'

type Standing = {
  placement: number
  wins: number
  losses: number
  ties: number
  weekly_points: number
  tournament: { name: string; tournament_date: string } | { name: string; tournament_date: string }[] | null
}

function tournamentFrom(row: Standing) {
  if (Array.isArray(row.tournament)) return row.tournament[0] ?? null
  return row.tournament
}

export default async function MyStatsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/my-stats')

  const { data: profile } = await supabase
    .from('profiles')
    .select('player_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.player_id) {
    const [{ data: players }, { data: claim }] = await Promise.all([
      supabase.from('players').select('id,name').order('name'),
      supabase.from('player_claims').select('player_id,status').eq('user_id', user.id).maybeSingle(),
    ])

    let existingClaim = null
    if (claim?.player_id) {
      const { data: claimPlayer } = await supabase
        .from('players')
        .select('name')
        .eq('id', claim.player_id)
        .maybeSingle()

      existingClaim = {
        player_id: claim.player_id,
        player_name: claimPlayer?.name || 'Unknown blader',
        status: claim.status as 'pending' | 'rejected' | 'approved',
      }
    }

    return <main className="accountMain">
      <section className="accountHero accountHeroRow">
        <div>
          <a className="backLink" href="/">← Back to League</a>
          <div className="eyebrow">SGBEYLION LEAGUE</div>
          <h1>My Stats</h1>
          <p>Your account is not linked to a CT blader yet.</p>
        </div>
        <AccountActions />
      </section>

      <ClaimPlayerForm players={(players ?? []) as { id: string; name: string }[]} existingClaim={existingClaim} />
    </main>
  }

  const [{ data: player }, { data: standings, error }] = await Promise.all([
    supabase.from('players').select('id,name').eq('id', profile.player_id).single(),
    supabase
      .from('weekly_standings')
      .select('placement,wins,losses,ties,weekly_points,tournament:tournaments(name,tournament_date)')
      .eq('player_id', profile.player_id),
  ])

  const rows = ((standings ?? []) as Standing[]).sort((a, b) => {
    const ad = tournamentFrom(a)?.tournament_date || ''
    const bd = tournamentFrom(b)?.tournament_date || ''
    return bd.localeCompare(ad)
  })

  const totals = rows.reduce((acc, row) => {
    acc.wins += Number(row.wins || 0)
    acc.losses += Number(row.losses || 0)
    acc.ties += Number(row.ties || 0)
    acc.points += Number(row.weekly_points || 0)
    acc.bestPlacement = Math.min(acc.bestPlacement, Number(row.placement || Number.MAX_SAFE_INTEGER))
    return acc
  }, { wins: 0, losses: 0, ties: 0, points: 0, bestPlacement: Number.MAX_SAFE_INTEGER })

  const matches = totals.wins + totals.losses + totals.ties
  const winRate = matches > 0 ? (totals.wins / matches) * 100 : 0
  const bestPlacement = Number.isFinite(totals.bestPlacement) && totals.bestPlacement !== Number.MAX_SAFE_INTEGER
    ? totals.bestPlacement
    : null

  return <main className="accountMain">
    <section className="accountHero accountHeroRow">
      <div>
        <a className="backLink" href="/">← Back to League</a>
        <div className="eyebrow">SGBEYLION LEAGUE · PERSONAL CT RECORD</div>
        <h1>{player?.name || 'My Stats'}</h1>
        <p>Official results below come directly from SGBEYLION CT uploads and cannot be edited by the player account.</p>
      </div>
      <AccountActions />
    </section>

    {error ? <section className="accountCard"><p>Unable to load your CT history.</p></section> : <>
      <section className="statsGrid">
        <div className="statCard"><span>CTs Played</span><strong>{rows.length}</strong></div>
        <div className="statCard"><span>Matches</span><strong>{matches}</strong></div>
        <div className="statCard"><span>Win Rate</span><strong>{winRate.toFixed(1)}%</strong></div>
        <div className="statCard"><span>Record</span><strong>{totals.wins}-{totals.losses}-{totals.ties}</strong></div>
        <div className="statCard"><span>Best Finish</span><strong>{bestPlacement ? `#${bestPlacement}` : '—'}</strong></div>
        <div className="statCard"><span>League Points</span><strong>{totals.points}</strong></div>
      </section>

      <section className="accountCard">
        <div className="sectionHeading accountSectionHeading">
          <div><span className="sectionKicker">HISTORY</span><h2>CT Results</h2></div>
        </div>
        {rows.length === 0 ? <p className="accountMuted">No CT results found yet.</p> : <div className="tableWrap">
          <table>
            <thead><tr><th>Date</th><th>Tournament</th><th>Rank</th><th>W-L-T</th><th>Points</th></tr></thead>
            <tbody>
              {rows.map((row, index) => {
                const tournament = tournamentFrom(row)
                return <tr key={`${tournament?.tournament_date || 'unknown'}-${index}`}>
                  <td>{tournament?.tournament_date || '—'}</td>
                  <td className="bladerName">{tournament?.name || 'CT'}</td>
                  <td>#{row.placement}</td>
                  <td>{row.wins}-{row.losses}-{row.ties}</td>
                  <td className="points">{row.weekly_points}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>}
      </section>
    </>}
  </main>
}
