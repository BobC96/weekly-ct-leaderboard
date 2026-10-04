'use client'

import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

export default function LoginClient({ nextPath }: { nextPath: string }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      const supabase = createClient()

      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        window.location.href = nextPath
        return
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      })

      if (error) throw error

      if (data.session) {
        window.location.href = nextPath
        return
      }

      setMessage('Account created. Check your email to confirm the account, then sign in.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to continue.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="accountMain">
    <section className="accountHero">
      <a className="backLink" href="/">← Back to League</a>
      <div className="eyebrow">SGBEYLION LEAGUE</div>
      <h1>{mode === 'login' ? 'Blader Login' : 'Create Account'}</h1>
      <p>Sign in to claim your CT identity and track your personal tournament stats.</p>
    </section>

    <form className="accountCard authCard" onSubmit={submit}>
      <label>Email</label>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        autoComplete="email"
        required
      />

      <label>Password</label>
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        minLength={mode === 'signup' ? 8 : undefined}
        required
      />

      <button className="primaryButton" type="submit" disabled={busy}>
        {busy ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
      </button>

      <button
        className="textButton"
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login')
          setMessage('')
        }}
      >
        {mode === 'login' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
      </button>

      {message && <p className="formMessage accountMessage">{message}</p>}
    </form>
  </main>
}
