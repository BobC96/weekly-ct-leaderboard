'use client'

import { createClient } from '@/lib/supabase/browser'

export default function AccountActions() {
  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return <button className="secondaryButton" type="button" onClick={signOut}>Sign Out</button>
}
