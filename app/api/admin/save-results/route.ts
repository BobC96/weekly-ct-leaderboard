import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { SupabaseRestError, supabaseRest } from '@/lib/supabase/admin-rest'

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

type Player = { id: string; name: string }
type Tournament = { id: string }

type SaveStage =
  | 'validation'
  | 'players_read'
  | 'players_create'
  | 'players_refresh'
  | 'tournament'
  | 'standings'
  | 'rollback'

function normalizedPlayerKey(name: string) {
  return name.trim().toLocaleLowerCase('en-US')
}

function errorResponse(stage: SaveStage, error: unknown) {
  const message = error instanceof SupabaseRestError
    ? error.message
    : error instanceof Error
      ? error.message
      : String(error || 'Unknown error')

  console.error(`[save-results:${stage}]`, error)

  return NextResponse.json(
    {
      error: `Save failed during ${stage.replaceAll('_', ' ')}: ${message}`,
      stage,
    },
    { status: 500 },
  )
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  let tournamentId: string | null = null

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

    // Read players first. This avoids trying to upsert every participant on each CT.
    let players: Player[]
    try {
      players = await supabaseRest<Player[]>('/players?select=id,name', {}, 'players_read')
    } catch (error) {
      return errorResponse('players_read', error)
    }

    let playerIds = new Map<string, string>()
    for (const player of players || []) {
      playerIds.set(normalizedPlayerKey(player.name), player.id)
    }

    const missingNames = cleanResults
      .filter(row => !playerIds.has(normalizedPlayerKey(row.name)))
      .map(row => row.name)

    if (missingNames.length > 0) {
      try {
        await supabaseRest(
          '/players?on_conflict=name',
          {
            method: 'POST',
            body: missingNames.map(playerName => ({ name: playerName })),
            prefer: 'resolution=ignore-duplicates,return=minimal',
          },
          'players_create',
        )
      } catch (error) {
        return errorResponse('players_create', error)
      }

      try {
        players = await supabaseRest<Player[]>('/players?select=id,name', {}, 'players_refresh')
      } catch (error) {
        return errorResponse('players_refresh', error)
      }

      playerIds = new Map<string, string>()
      for (const player of players || []) {
        playerIds.set(normalizedPlayerKey(player.name), player.id)
      }
    }

    const unresolved = cleanResults.filter(row => !playerIds.has(normalizedPlayerKey(row.name)))
    if (unresolved.length > 0) {
      return NextResponse.json(
        {
          error: `Could not resolve player IDs for: ${unresolved.map(row => row.name).join(', ')}`,
          stage: 'players_refresh',
        },
        { status: 500 },
      )
    }

    let tournamentRows: Tournament[]
    try {
      tournamentRows = await supabaseRest<Tournament[]>(
        '/tournaments?select=id',
        {
          method: 'POST',
          body: {
            name: name.trim(),
            tournament_date,
            challonge_url: challonge_url?.trim() || null,
          },
          prefer: 'return=representation',
        },
        'tournament',
      )
    } catch (error) {
      return errorResponse('tournament', error)
    }

    const tournament = tournamentRows?.[0]
    if (!tournament?.id) {
      return errorResponse('tournament', new Error('Tournament ID was not returned by Supabase.'))
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

    try {
      await supabaseRest(
        '/weekly_standings',
        {
          method: 'POST',
          body: standingRows,
          prefer: 'return=minimal',
        },
        'standings',
      )
    } catch (error) {
      try {
        await supabaseRest(
          `/tournaments?id=eq.${encodeURIComponent(tournament.id)}`,
          { method: 'DELETE', prefer: 'return=minimal', retries: 0 },
          'rollback',
        )
        tournamentId = null
      } catch (rollbackError) {
        console.error('[save-results:rollback]', rollbackError)
      }
      return errorResponse('standings', error)
    }

    return NextResponse.json({
      ok: true,
      tournament_id: tournament.id,
      players_saved: cleanResults.length,
      attendance_updated: true,
    })
  } catch (error) {
    if (tournamentId) {
      try {
        await supabaseRest(
          `/tournaments?id=eq.${encodeURIComponent(tournamentId)}`,
          { method: 'DELETE', prefer: 'return=minimal', retries: 0 },
          'rollback',
        )
      } catch (rollbackError) {
        console.error('[save-results:rollback-after-exception]', rollbackError)
      }
    }

    return errorResponse('validation', error)
  }
}
