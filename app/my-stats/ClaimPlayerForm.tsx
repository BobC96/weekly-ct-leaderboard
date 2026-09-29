'use client'

import { FormEvent, useState } from 'react'

type Player = { id: string; name: string }

type ExistingClaim = {
  player_id: string
  player_name: string
  status: 'pending' | 'rejected' | 'approved'
} | null

export default function ClaimPlayerForm({
  players,
  existingClaim,
}: {
  players: Player[]
  existingClaim: ExistingClaim
}) {
  const [playerId, setPlayerId] = useState(existingClaim?.status === 'pending' ? existingClaim.player_id : '')
  const [message, setMessage] = useState(
    existingClaim?.status === 'pending'
      ? `Your claim for ${existingClaim.player_name} is waiting for admin approval.`
      : existingClaim?.status === 'rejected'
        ? `Your previous claim for ${existingClaim.player_name} was not approved. You can submit another.`
        : '',
  )
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!playerId) return
    setBusy(true)
    setMessage('')

    try {
      const response = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to submit claim.')
      setMessage('Claim submitted. An SGBEYLION admin must approve it before your stats are linked.')
      window.setTimeout(() => window.location.reload(), 900)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to submit claim.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="accountCard">
    <span className="sectionKicker">LINK YOUR CT HISTORY</span>
    <h2>Claim Your Blader Name</h2>
    <p className="accountMuted">
      Pick the name you use in SGBEYLION CT. Your request is reviewed before the account is linked, so nobody can simply claim another blader's results.
    </p>

    <form onSubmit={submit} className="claimForm">
      <label>Blader</label>
      <select value={playerId} onChange={e => setPlayerId(e.target.value)} required>
        <option value="">Select your CT name...</option>
        {players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
      </select>
      <button className="primaryButton" type="submit" disabled={busy || !playerId}>
        {busy ? 'Submitting...' : existingClaim?.status === 'pending' ? 'Change Pending Claim' : 'Claim This Blader'}
      </button>
    </form>

    {message && <p className="formMessage accountMessage">{message}</p>}
  </section>
}
