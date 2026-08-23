'use client'

import { FormEvent, useState } from 'react'

type ResultRow = {
  name: string
  placement: string
  wins: string
  losses: string
  ties: string
  tiebreak: string
  buchholz: string
  point_diff: string
}

const blankRow = (): ResultRow => ({
  name: '', placement: '', wins: '', losses: '', ties: '0', tiebreak: '0', buchholz: '0', point_diff: '0'
})

export default function AdminClient({ initiallyAuthenticated }: { initiallyAuthenticated: boolean }) {
  const [authenticated, setAuthenticated] = useState(initiallyAuthenticated)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [tournamentName, setTournamentName] = useState('')
  const [date, setDate] = useState('')
  const [challongeUrl, setChallongeUrl] = useState('')
  const [rows, setRows] = useState<ResultRow[]>(Array.from({ length: 8 }, blankRow))

  async function login(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json()
    if (!res.ok) return setMessage(data.error || 'Login failed.')
    setAuthenticated(true)
    setPassword('')
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    setAuthenticated(false)
  }

  function updateRow(index: number, key: keyof ResultRow, value: string) {
    setRows(current => current.map((r, i) => i === index ? { ...r, [key]: value } : r))
  }

  function addRows(count = 5) {
    setRows(current => [...current, ...Array.from({ length: count }, blankRow)])
  }

  function removeRow(index: number) {
    setRows(current => current.filter((_, i) => i !== index))
  }

  async function importChallonge() {
    if (!challongeUrl.trim()) {
      setMessage('Enter a Challonge tournament URL first.')
      return
    }

    setImporting(true)
    setMessage('')

    const res = await fetch('/api/admin/import-challonge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challonge_url: challongeUrl }),
    })
    const data = await res.json()
    setImporting(false)

    if (!res.ok) {
      if (res.status === 401) setAuthenticated(false)
      return setMessage(data.error || 'Unable to import Challonge standings.')
    }

    const imported: ResultRow[] = (data.results || []).map((r: any) => ({
      name: String(r.name || ''),
      placement: String(r.placement ?? ''),
      wins: String(r.wins ?? 0),
      losses: String(r.losses ?? 0),
      ties: String(r.ties ?? 0),
      tiebreak: String(r.tiebreak ?? 0),
      buchholz: String(r.buchholz ?? 0),
      point_diff: String(r.point_diff ?? 0),
    }))

    setRows(imported.length ? imported : Array.from({ length: 8 }, blankRow))
    if (!tournamentName.trim() && data.tournament_name) setTournamentName(data.tournament_name)
    setChallongeUrl(data.standings_url || challongeUrl)
    setMessage(`Imported ${imported.length} players from Challonge. Review the rows, then save.`)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    const results = rows
      .filter(r => r.name.trim())
      .map(r => ({
        name: r.name.trim(),
        placement: Number(r.placement),
        wins: Number(r.wins || 0),
        losses: Number(r.losses || 0),
        ties: Number(r.ties || 0),
        tiebreak: Number(r.tiebreak || 0),
        buchholz: Number(r.buchholz || 0),
        point_diff: Number(r.point_diff || 0),
      }))

    const res = await fetch('/api/admin/save-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: tournamentName,
        tournament_date: date,
        challonge_url: challongeUrl,
        results,
      }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      if (res.status === 401) setAuthenticated(false)
      return setMessage(data.error || 'Unable to save.')
    }

    setMessage('Tournament saved. The monthly leaderboard has been updated.')
    setTournamentName('')
    setDate('')
    setChallongeUrl('')
    setRows(Array.from({ length: 8 }, blankRow))
  }

  if (!authenticated) {
    return <main className="adminMain">
      <section className="adminHeader">
        <div className="eyebrow">WEEKLY CT</div>
        <h1>Admin Login</h1>
        <p>Enter your administrator password.</p>
      </section>
      <form className="adminCard loginCard" onSubmit={login}>
        <label>Admin Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
        <button className="primaryButton" type="submit">Login</button>
        {message && <p className="formMessage errorMessage">{message}</p>}
      </form>
    </main>
  }

  return <main className="adminMain">
    <section className="adminHeader adminHeaderRow">
      <div>
        <div className="eyebrow">WEEKLY CT</div>
        <h1>Tournament Admin</h1>
        <p>Create a tournament and enter the final Challonge standings.</p>
      </div>
      <div className="headerActions">
        <a className="secondaryButton" href="/">View Leaderboard</a>
        <button className="secondaryButton" type="button" onClick={logout}>Logout</button>
      </div>
    </section>

    <form onSubmit={save}>
      <section className="adminCard">
        <h2>Tournament</h2>
        <div className="formGrid">
          <div>
            <label>Tournament Name</label>
            <input value={tournamentName} onChange={e => setTournamentName(e.target.value)} placeholder="Weekly CT - 30 Aug 2026" required />
          </div>
          <div>
            <label>Tournament Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div className="fullField">
            <label>Challonge URL <span>(paste the tournament or standings URL)</span></label>
            <div className="challongeImportRow">
              <input type="url" value={challongeUrl} onChange={e => setChallongeUrl(e.target.value)} placeholder="https://challonge.com/ru2kifce" />
              <button type="button" className="secondaryButton importButton" onClick={importChallonge} disabled={importing}>
                {importing ? 'Importing...' : 'Import Standings'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="adminCard">
        <div className="resultsTitle">
          <div><h2>Final Standings</h2><p>Points are calculated automatically after saving.</p></div>
          <button type="button" className="secondaryButton" onClick={() => addRows(5)}>+ Add 5 Rows</button>
        </div>

        <div className="resultsWrap">
          <table className="entryTable">
            <thead><tr><th>Player</th><th>Rank</th><th>W</th><th>L</th><th>T</th><th>TB</th><th>Buchholz</th><th>Diff</th><th></th></tr></thead>
            <tbody>
              {rows.map((row, i) => <tr key={i}>
                <td><input value={row.name} onChange={e => updateRow(i, 'name', e.target.value)} placeholder="Player name" /></td>
                <td><input type="number" min="1" value={row.placement} onChange={e => updateRow(i, 'placement', e.target.value)} /></td>
                <td><input type="number" min="0" value={row.wins} onChange={e => updateRow(i, 'wins', e.target.value)} /></td>
                <td><input type="number" min="0" value={row.losses} onChange={e => updateRow(i, 'losses', e.target.value)} /></td>
                <td><input type="number" min="0" value={row.ties} onChange={e => updateRow(i, 'ties', e.target.value)} /></td>
                <td><input type="number" step="0.5" value={row.tiebreak} onChange={e => updateRow(i, 'tiebreak', e.target.value)} /></td>
                <td><input type="number" step="0.5" value={row.buchholz} onChange={e => updateRow(i, 'buchholz', e.target.value)} /></td>
                <td><input type="number" value={row.point_diff} onChange={e => updateRow(i, 'point_diff', e.target.value)} /></td>
                <td><button className="removeButton" type="button" onClick={() => removeRow(i)}>×</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>

        <div className="formFooter">
          <button type="button" className="secondaryButton" onClick={() => addRows(10)}>+ Add 10 Rows</button>
          <button className="primaryButton" disabled={saving} type="submit">{saving ? 'Saving...' : 'Save Tournament Results'}</button>
        </div>
        {message && <p className={(message.startsWith('Tournament saved') || message.startsWith('Imported')) ? 'formMessage successMessage' : 'formMessage errorMessage'}>{message}</p>}
      </section>
    </form>
  </main>
}
