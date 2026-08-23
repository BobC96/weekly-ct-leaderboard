'use client'

import { ChangeEvent, FormEvent, useState } from 'react'
import * as XLSX from 'xlsx'

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

  function normalizeHeader(value: unknown) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
  }

  function pick(row: Record<string, unknown>, aliases: string[]) {
    const normalized = Object.entries(row).map(([key, value]) => [normalizeHeader(key), value] as const)
    for (const alias of aliases) {
      const target = normalizeHeader(alias)
      const found = normalized.find(([key]) => key === target)
      if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== '') return found[1]
    }
    return ''
  }

  function parseRecord(value: unknown) {
    const text = String(value ?? '').trim()
    const match = text.match(/(\d+)\s*[-–]\s*(\d+)(?:\s*[-–]\s*(\d+))?/)
    if (!match) return null
    return { wins: match[1], losses: match[2], ties: match[3] || '0' }
  }

  async function importSpreadsheet(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setMessage('')

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) throw new Error('The spreadsheet does not contain a worksheet.')

      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      if (!data.length) throw new Error('No standings rows were found in the spreadsheet.')

      const imported = data.map((r, index): ResultRow | null => {
        const name = pick(r, ['Participant', 'Player', 'Player Name', 'Name', 'Competitor'])
        if (!String(name).trim()) return null

        const combinedRecord = pick(r, ['Match W-L-T', 'Match W L T', 'W-L-T', 'Record', 'Match Record'])
        const parsed = parseRecord(combinedRecord)

        const placement = pick(r, ['Rank', 'Place', 'Placement', 'Standing', '#'])
        const wins = pick(r, ['W', 'Wins', 'Win'])
        const losses = pick(r, ['L', 'Losses', 'Loss'])
        const ties = pick(r, ['T', 'Ties', 'Draws', 'Draw'])
        const tb = pick(r, ['TB', 'Tiebreak', 'Tie Break', 'Tie-Break'])
        const buchholz = pick(r, ['Buchholz', 'Buchholz Score', 'Buchholz TB'])
        const diff = pick(r, ['Pts Diff', 'Points Diff', 'Point Diff', 'Pts Differential', 'Differential', 'Diff'])

        return {
          name: String(name).trim(),
          placement: String(placement || index + 1),
          wins: String(wins !== '' ? wins : parsed?.wins ?? 0),
          losses: String(losses !== '' ? losses : parsed?.losses ?? 0),
          ties: String(ties !== '' ? ties : parsed?.ties ?? 0),
          tiebreak: String(tb !== '' ? tb : 0),
          buchholz: String(buchholz !== '' ? buchholz : 0),
          point_diff: String(diff !== '' ? diff : 0),
        }
      }).filter((r): r is ResultRow => r !== null)

      if (!imported.length) {
        throw new Error('Could not find a Player/Participant/Name column in the spreadsheet.')
      }

      setRows(imported)
      setMessage(`Imported ${imported.length} players from ${file.name}. Review the rows, then save.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to read the spreadsheet.')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
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
            <label>Challonge URL <span>(optional, saved as tournament reference)</span></label>
            <input type="url" value={challongeUrl} onChange={e => setChallongeUrl(e.target.value)} placeholder="https://challonge.com/ru2kifce" />
          </div>
          <div className="fullField">
            <label>Import Standings <span>(Excel .xlsx/.xls or CSV)</span></label>
            <div className="challongeImportRow">
              <input type="file" accept=".xlsx,.xls,.csv,text/csv" onChange={importSpreadsheet} disabled={importing} />
              <span className="importHint">{importing ? 'Reading file...' : 'The imported rows remain editable before saving.'}</span>
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
