'use client'

import { useCallback, useEffect, useState } from 'react'

type Claim = {
  user_id: string
  player_id: string
  player_name: string
  requester_email: string | null
  created_at: string
}

export default function ClaimsClient() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch('/api/admin/claims', { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) setMessage(data.error || 'Unable to load claims.')
    else setClaims(data.claims || [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function review(userId: string, action: 'approve' | 'reject') {
    setBusy(userId)
    setMessage('')
    try {
      const response = await fetch('/api/admin/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, action }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to review claim.')
      setMessage(action === 'approve' ? 'Claim approved.' : 'Claim rejected.')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to review claim.')
    } finally {
      setBusy(null)
    }
  }

  return <main className="adminMain">
    <section className="adminHeader adminHeaderRow">
      <div>
        <div className="eyebrow">SGBEYLION CT</div>
        <h1>Player Claims</h1>
        <p>Approve only when you know the account belongs to that blader.</p>
      </div>
      <div className="headerActions">
        <a className="secondaryButton" href="/admin">Tournament Admin</a>
        <a className="secondaryButton" href="/">View League</a>
      </div>
    </section>

    <section className="adminCard">
      {loading ? <p>Loading claims...</p> : claims.length === 0 ? <p>No pending player claims.</p> : <div className="claimAdminList">
        {claims.map(claim => <article className="claimAdminRow" key={claim.user_id}>
          <div>
            <strong>{claim.player_name}</strong>
            <span>{claim.requester_email || claim.user_id}</span>
            <small>Requested {new Date(claim.created_at).toLocaleString('en-SG')}</small>
          </div>
          <div className="claimAdminActions">
            <button className="primaryButton" disabled={busy === claim.user_id} onClick={() => review(claim.user_id, 'approve')}>Approve</button>
            <button className="secondaryButton" disabled={busy === claim.user_id} onClick={() => review(claim.user_id, 'reject')}>Reject</button>
          </div>
        </article>)}
      </div>}
      {message && <p className="formMessage accountMessage">{message}</p>}
    </section>
  </main>
}
