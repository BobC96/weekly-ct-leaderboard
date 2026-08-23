import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'

type ImportedRow = {
  name: string
  placement: number
  wins: number
  losses: number
  ties: number
  tiebreak: number
  buchholz: number
  point_diff: number
}

function decodeHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeStandingsUrl(input: string) {
  let raw = input.trim()
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`

  const url = new URL(raw)
  const host = url.hostname.toLowerCase()
  if (host !== 'challonge.com' && !host.endsWith('.challonge.com')) {
    throw new Error('Please enter a challonge.com tournament URL.')
  }

  // Remove common page suffixes and point to public standings.
  let path = url.pathname.replace(/\/+$/, '')
  path = path.replace(/\/(standings|participants|matches|log|announcements|module)$/i, '')
  if (!path || path === '/') throw new Error('The Challonge tournament URL is incomplete.')

  return `${url.protocol}//${url.host}${path}/standings`
}

function parseStandings(html: string) {
  const rows: ImportedRow[] = []
  const trMatches = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []

  for (const tr of trMatches) {
    const cells = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => decodeHtml(m[1]))
    if (cells.length < 7) continue

    const placement = Number(cells[0].replace(/[^0-9]/g, ''))
    const name = cells[1].trim()
    const record = cells[2].match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/)
    // Challonge standings columns: Rank, Participant, Match W-L-T, Score, TB, Buchholz, Pts Diff
    const tiebreak = Number(cells[4] || '0')
    const buchholz = Number(cells[5] || '0')
    const diffText = cells[6].replace(/[^0-9+\-]/g, '')
    const pointDiff = Number(diffText || '0')

    if (!Number.isInteger(placement) || placement < 1 || !name || !record) continue

    rows.push({
      name,
      placement,
      wins: Number(record[1]),
      losses: Number(record[2]),
      ties: Number(record[3]),
      tiebreak: Number.isFinite(tiebreak) ? tiebreak : 0,
      buchholz: Number.isFinite(buchholz) ? buchholz : 0,
      point_diff: Number.isFinite(pointDiff) ? pointDiff : 0,
    })
  }

  // Deduplicate by placement in case mobile/desktop copies of the same table exist.
  const unique = new Map<number, ImportedRow>()
  for (const row of rows) if (!unique.has(row.placement)) unique.set(row.placement, row)
  return [...unique.values()].sort((a, b) => a.placement - b.placement)
}

function extractTournamentName(html: string) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1) return decodeHtml(h1[1])

  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  if (!title) return ''
  return decodeHtml(title[1])
    .replace(/\s*-\s*Standings\s*-\s*Challonge\s*$/i, '')
    .replace(/\s*-\s*Challonge\s*$/i, '')
    .trim()
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const inputUrl = String(body?.challonge_url || '').trim()
    if (!inputUrl) {
      return NextResponse.json({ error: 'Enter a Challonge tournament URL first.' }, { status: 400 })
    }

    const standingsUrl = normalizeStandingsUrl(inputUrl)
    const response = await fetch(standingsUrl, {
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WeeklyCTLeaderboard/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Challonge returned HTTP ${response.status}. Check that the tournament is public.` },
        { status: 502 },
      )
    }

    const html = await response.text()
    const results = parseStandings(html)
    if (results.length === 0) {
      return NextResponse.json({
        error: 'No standings rows were found. Make sure the tournament is public and its standings page is available. You can still enter results manually.'
      }, { status: 422 })
    }

    return NextResponse.json({
      ok: true,
      standings_url: standingsUrl,
      tournament_name: extractTournamentName(html),
      results,
    })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json({ error: error?.message || 'Unable to import Challonge standings.' }, { status: 500 })
  }
}
