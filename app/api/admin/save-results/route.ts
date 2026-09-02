import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

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

type SaveStage =
  | 'validation'
  | 'players'
  | 'player_lookup'
  | 'tournament'
  | 'standings'
  | 'rollback'

function stageError(stage: SaveStage, error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message || 'Unknown error')
      : String(error || 'Unknown error')

  console.error(`[save-results:${stage}]`, error)
  return NextResponse.json(
    { error: `Save failed during ${stage.replace('_', ' ')}: ${message}`, stage },
    { status: 500 },
  )
}

function normalizedPlayerKey(name: string) {
  return name.trim().toLocaleLowerCase('en-US')
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  let tournamentId: string | null = null
  const supabase = createAdminClient()

  try {
    const body = await request.json()
    const { name, tournament_date, challonge_url, results } = body as {
      name: string
      tournament_date: string
      challonge_url?: string
      results: ResultRow[]
    }

    if (!name?.trim() || !tournament_date) {
      return NextResponse.json(
        { error: 'Tournament name and date are required.', stage: 'validation' },
        { status: 400 },
      )
    }

    const cleanResults = (results || [])
      .filter(row => row.name?.trim())
      .map(row => ({
        ...row,
        name: row.name.trim(),
        placement: Number(row.placement),
        wins: Number(row.wins || 0),
        losses: Number(row.losses || 0),
        ties: Number(row.ties || 0),
        tiebreak: Number(row.tiebreak || 0),
        buchholz: Number(row.buchholz || 0),
        point_diff: Number(row.point_diff || 0),
      }))

    if (cleanResults.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one player result.', stage: 'validation' },
        { status: 400 },
      )
    }

    const placements = new Set<number>()
    const playerKeys = new Set<string>()

    for (const row of cleanResults) {
      if (!Number.isInteger(row.placement) || row.placement < 1) {
        return NextResponse.json(
          { error: `Invalid placement for ${row.name}.`, stage: 'validation' },
          { status: 400 },
        )
      }

      if (placements.has(row.placement)) {
        return NextResponse.json(
          { error: `Placement ${row.placement} is entered more than once.`, stage: 'validation' },
          { status: 400 },
        )
      }
      placements.add(row.placement)

      const key = normalizedPlayerKey(row.name)
      if (playerKeys.has(key)) {
        return NextResponse.json(
          { error: `Player ${row.name} appears more than once in this tournament.`, stage: 'validation' },
          { status: 400 },
        )
      }
      playerKeys.add(key)
    }

    // Bulk-create any missing players in one request. Existing names are ignored.
    const uniquePlayerNames = cleanResults.map(row => row.name)
    const { error: playerUpsertError } = await supabase
      .from('players')
      .upsert(
        uniquePlayerNames.map(playerName => ({ name: playerName })),
        { onConflict: 'name', ignoreDuplicates: true },
      )

    if (playerUpsertError) {
      return stageError('players', playerUpsertError)
    }

    // Fetch all player IDs in one request.
    const { data: players, error: playerLookupError } = await supabase
      .from('players')
      .select('id,name')
      .in('name', uniquePlayerNames)

    if (playerLookupError) {
      return stageError('player_lookup', playerLookupError)
    }

    const playerIds = new Map<string, string>()
    for (const player of players || []) {
      playerIds.set(normalizedPlayerKey(player.name), player.id)
    }

    const missingPlayers = cleanResults.filter(row => !playerIds.has(normalizedPlayerKey(row.name)))
    if (missingPlayers.length > 0) {
      return NextResponse.json(
        {
          error: `Could not resolve player IDs for: ${missingPlayers.map(row => row.name).join(', ')}`,
          stage: 'player_lookup',
        },
        { status: 500 },
      )
    }

    // Create the tournament only after all player IDs are ready.
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .insert({
        name: name.trim(),
        tournament_date,
        challonge_url: challonge_url?.trim() || null,
      })
      .select('id')
      .single()

    if (tournamentError || !tournament?.id) {
      return stageError('tournament', tournamentError || new Error('Tournament ID was not returned.'))
    }

    tournamentId = tournament.id

    const standingRows = cleanResults.map(row => ({
      tournament_id: tournament.id,
      player_id: playerIds.get(normalizedPlayerKey(row.name))!,
      placement: row.placement,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      tiebreak: row.tiebreak,
      buchholz: row.buchholz,
      point_diff: row.point_diff,
    }))

    // Save all standings in one insert. The DB trigger calculates weekly points.
    const { error: standingsError } = await supabase
      .from('weekly_standings')
      .insert(standingRows)

    if (standingsError) {
      // Best-effort rollback: deleting the tournament cascades its standings.
      const { error: rollbackError } = await supabase
        .from('tournaments')
        .delete()
        .eq('id', tournament.id)

      if (rollbackError) {
        console.error('[save-results:rollback]', rollbackError)
        return NextResponse.json(
          {
            error: `Standings save failed: ${standingsError.message}. Automatic rollback also failed: ${rollbackError.message}`,
            stage: 'rollback',
          },
          { status: 500 },
        )
      }

      tournamentId = null
      return stageError('standings', standingsError)
    }

    return NextResponse.json({
      ok: true,
      tournament_id: tournament.id,
      players_saved: cleanResults.length,
    })
  } catch (error) {
    // If an unexpected error happens after tournament creation, try to clean it up.
    if (tournamentId) {
      try {
        await supabase.from('tournaments').delete().eq('id', tournamentId)
      } catch (rollbackError) {
        console.error('[save-results:rollback-after-exception]', rollbackError)
      }
    }

    return stageError('validation', error)
  }
}
