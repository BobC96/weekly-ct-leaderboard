import { AdminRequestError, readAdminJson } from '@/lib/admin-request'
import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: claims, error } = await admin
    .from('player_claims')
    .select('user_id,player_id,requester_email,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[admin-claims:list]', error)
    return NextResponse.json({ error: 'Unable to load claims.' }, { status: 500 })
  }

  const playerIds = [...new Set((claims || []).map(claim => claim.player_id))]
  const { data: players, error: playersError } = playerIds.length
    ? await admin.from('players').select('id,name').in('id', playerIds)
    : { data: [], error: null }

  if (playersError) {
    console.error('[admin-claims:players]', playersError)
    return NextResponse.json({ error: 'Unable to load player names.' }, { status: 500 })
  }

  const names = new Map((players || []).map(player => [player.id, player.name]))
  return NextResponse.json({
    claims: (claims || []).map(claim => ({
      ...claim,
      player_name: names.get(claim.player_id) || 'Unknown blader',
    })),
  })
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  let body: Record<string, unknown>
  try {
    body = await readAdminJson(request, 4096)
  } catch (error) {
    return NextResponse.json({ error: error instanceof AdminRequestError ? error.message : 'Invalid request.' }, {
      status: error instanceof AdminRequestError ? error.status : 400,
    })
  }
  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  const action = body.action
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
    || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ error: 'Invalid review request.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: claim, error: claimError } = await admin
    .from('player_claims')
    .select('user_id,player_id,status')
    .eq('user_id', userId)
    .maybeSingle()

  if (claimError || !claim || claim.status !== 'pending') {
    return NextResponse.json({ error: 'Pending claim not found.' }, { status: 404 })
  }

  if (action === 'reject') {
    const { error } = await admin
      .from('player_claims')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'pending')

    if (error) return NextResponse.json({ error: 'Unable to reject claim.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { data: playerOwner } = await admin
    .from('profiles')
    .select('user_id')
    .eq('player_id', claim.player_id)
    .maybeSingle()

  if (playerOwner && playerOwner.user_id !== userId) {
    return NextResponse.json({ error: 'That blader is already linked to another account.' }, { status: 409 })
  }

  const { data: currentProfile } = await admin
    .from('profiles')
    .select('player_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (currentProfile?.player_id && currentProfile.player_id !== claim.player_id) {
    return NextResponse.json({ error: 'This account is already linked to a different blader.' }, { status: 409 })
  }

  const { error: profileError } = await admin
    .from('profiles')
    .upsert({
      user_id: userId,
      player_id: claim.player_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (profileError) {
    console.error('[admin-claims:approve-profile]', profileError)
    return NextResponse.json({ error: 'Unable to link the player profile.' }, { status: 500 })
  }

  const { error: claimUpdateError } = await admin
    .from('player_claims')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('user_id', userId)

  if (claimUpdateError) {
    console.error('[admin-claims:approve-claim]', claimUpdateError)
    return NextResponse.json({ error: 'Profile linked, but claim status could not be updated. Check Supabase.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
