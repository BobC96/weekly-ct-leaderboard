import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(request.url).origin
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const body = await request.json().catch(() => null) as { player_id?: string } | null
  const playerId = body?.player_id?.trim()
  if (!playerId || !/^[0-9a-f-]{36}$/i.test(playerId)) {
    return NextResponse.json({ error: 'Choose a valid blader.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: existingProfile, error: profileError } = await admin
    .from('profiles')
    .select('player_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError) return NextResponse.json({ error: 'Unable to check your profile.' }, { status: 500 })
  if (existingProfile?.player_id) {
    return NextResponse.json({ error: 'Your account is already linked to a blader.' }, { status: 409 })
  }

  const { data: player, error: playerError } = await admin
    .from('players')
    .select('id,name')
    .eq('id', playerId)
    .maybeSingle()

  if (playerError || !player) {
    return NextResponse.json({ error: 'That blader no longer exists.' }, { status: 404 })
  }

  const { error } = await admin
    .from('player_claims')
    .upsert({
      user_id: user.id,
      player_id: player.id,
      requester_email: user.email || null,
      status: 'pending',
      created_at: new Date().toISOString(),
      reviewed_at: null,
    }, { onConflict: 'user_id' })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That blader already has an active claim. Ask an admin if this is your name.' }, { status: 409 })
    }
    console.error('[player-claim]', error)
    return NextResponse.json({ error: 'Unable to submit the claim.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, player: player.name })
}
