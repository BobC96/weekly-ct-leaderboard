'use client'

import { useMemo, useState } from 'react'

type LeaderboardRow = {
  leaderboard_month: string
  player_id: string
  player_name: string
  tournaments_played: number
  total_wins: number
  total_losses: number
  total_ties: number
  total_point_diff: number
  total_match_points: number
  total_placement_points: number
  monthly_points: number
  best_placement: number
}

function attendanceRank(rows: LeaderboardRow[], index: number) {
  if (index === 0) return 1
  const current = rows[index]
  const previous = rows[index - 1]
  if (current.tournaments_played === previous.tournaments_played) {
    for (let i = index - 1; i >= 0; i--) {
      if (rows[i].tournaments_played !== current.tournaments_played) return i + 2
    }
    return 1
  }
  return index + 1
}

export default function LeaderboardTabs({ rows, totalEvents }: { rows: LeaderboardRow[]; totalEvents: number }) {
  const [tab, setTab] = useState<'rankings' | 'attendance'>('rankings')

  const attendanceRows = useMemo(() => [...rows].sort((a, b) =>
    b.tournaments_played - a.tournaments_played ||
    b.monthly_points - a.monthly_points ||
    b.total_wins - a.total_wins ||
    a.player_name.localeCompare(b.player_name)
  ), [rows])

  return <>
    <div className="tabBar" role="tablist" aria-label="Leaderboard view">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'rankings'}
        className={tab === 'rankings' ? 'tabButton activeTab' : 'tabButton'}
        onClick={() => setTab('rankings')}
      >🏆 Monthly Rankings</button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'attendance'}
        className={tab === 'attendance' ? 'tabButton activeTab' : 'tabButton'}
        onClick={() => setTab('attendance')}
      >👥 Attendance</button>
    </div>

    {tab === 'rankings' ? (
      <section className="card" role="tabpanel">
        <div className="sectionHeading">
          <div>
            <span className="sectionKicker">COMPETITIVE</span>
            <h2>Monthly Rankings</h2>
          </div>
          <span className="eventCount">{totalEvents} CT{totalEvents === 1 ? '' : 's'} this month</span>
        </div>
        <div className="tableWrap"><table><thead><tr><th>#</th><th>Blader</th><th>Events</th><th>W-L-T</th><th className="pointsHeaderCell"><span className="pointsHeaderLabel">Points</span><span className="pointsHelp"><button type="button" className="pointsHelpButton" aria-label="How leaderboard points are calculated" aria-describedby="points-help-popup">?</button><span id="points-help-popup" className="pointsHelpPopup" role="tooltip"><strong>How points are calculated</strong><span>Match Win: +3</span><span>Match Tie: +1</span><span>Match Loss: 0</span><span className="pointsHelpDivider" /><strong>Placement bonus</strong><span>1st: +10 · 2nd: +8 · 3rd: +6 · 4th: +5</span><span>5th–8th: +3 · 9th–16th: +2 · 17th+: +1</span><span className="pointsHelpDivider" /><span><strong>Weekly score</strong> = match points + placement bonus.</span><span><strong>Monthly score</strong> = all weekly scores added together for that month.</span></span></span></th></tr></thead><tbody>
          {rows.map((r, i) => <tr key={r.player_id}>
            <td className="rank">{i + 1}</td>
            <td className="bladerName">{r.player_name}</td>
            <td>{r.tournaments_played}</td>
            <td>{r.total_wins}-{r.total_losses}-{r.total_ties}</td>
            <td className="points">{r.monthly_points}</td>
          </tr>)}
        </tbody></table></div>
      </section>
    ) : (
      <section className="card" role="tabpanel">
        <div className="sectionHeading">
          <div>
            <span className="sectionKicker">LOYALTY</span>
            <h2>Monthly Attendance</h2>
          </div>
          <span className="eventCount">{totalEvents} CT{totalEvents === 1 ? '' : 's'} hosted</span>
        </div>
        <div className="tableWrap"><table><thead><tr><th>#</th><th>Blader</th><th>Attendance</th><th>Status</th></tr></thead><tbody>
          {attendanceRows.map((r, i) => {
            const perfect = totalEvents > 0 && r.tournaments_played === totalEvents
            return <tr key={r.player_id}>
              <td className="rank">{attendanceRank(attendanceRows, i)}</td>
              <td className="bladerName">{r.player_name}</td>
              <td><strong>{r.tournaments_played}</strong> / {totalEvents}</td>
              <td>{perfect ? <span className="perfectBadge">★ Perfect Attendance</span> : <span className="mutedStatus">{Math.max(totalEvents - r.tournaments_played, 0)} missed</span>}</td>
            </tr>
          })}
        </tbody></table></div>
      </section>
    )}
  </>
}
