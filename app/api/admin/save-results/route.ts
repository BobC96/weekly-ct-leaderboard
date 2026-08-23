import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

type ResultRow = {
  name: string
  placement: number
  wins: number
  losses: number
  ties: number
  tiebreak: number
  buchholz: number
  point_diff: number
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, tournament_date, challonge_url, results } = body as {
      name: string
      tournament_date: string
      challonge_url?: string
      results: ResultRow[]
    }

    if (!name?.trim() || !tournament_date) {
      return NextResponse.json({ error: 'Tournament name and date are required.' }, { status: 400 })
    }

    const cleanResults = (results || []).filter(r => r.name?.trim())
    if (cleanResults.length === 0) {
      return NextResponse.json({ error: 'Add at least one player result.' }, { status: 400 })
    }

    const placements = new Set<number>()
    for (const row of cleanResults) {
      if (!Number.isInteger(row.placement) || row.placement < 1) {
        return NextResponse.json({ error: `Invalid placement for ${row.name}.` }, { status: 400 })
      }
      if (placements.has(row.placement)) {
        return NextResponse.json({ error: `Placement ${row.placement} is entered more than once.` }, { status: 400 })
      }
      placements.add(row.placement)
    }

    const supabase = createAdminClient()

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .insert({
        name: name.trim(),
        tournament_date,
        challonge_url: challonge_url?.trim() || null,
      })
      .select('id')
      .single()

    if (tournamentError) throw tournamentError

    const playerIds = new Map<string, string>()

    for (const row of cleanResults) {
      const playerName = row.name.trim()
      const { data: existing, error: findError } = await supabase
        .from('players')
        .select('id')
        .eq('name', playerName)
        .maybeSingle()

      if (findError) throw findError

      if (existing?.id) {
        playerIds.set(playerName, existing.id)
      } else {
        const { data: created, error: createError } = await supabase
          .from('players')
          .insert({ name: playerName })
          .select('id')
          .single()
        if (createError) throw createError
        playerIds.set(playerName, created.id)
      }
    }

    const standingRows = cleanResults.map(row => ({
      tournament_id: tournament.id,
      player_id: playerIds.get(row.name.trim()),
      placement: Number(row.placement),
      wins: Number(row.wins || 0),
      losses: Number(row.losses || 0),
      ties: Number(row.ties || 0),
      tiebreak: Number(row.tiebreak || 0),
      buchholz: Number(row.buchholz || 0),
      point_diff: Number(row.point_diff || 0),
    }))

    const { error: standingsError } = await supabase
      .from('weekly_standings')
      .insert(standingRows)

    if (standingsError) throw standingsError

    return NextResponse.json({ ok: true, tournament_id: tournament.id })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json({ error: error?.message || 'Unable to save tournament.' }, { status: 500 })
  }
}
