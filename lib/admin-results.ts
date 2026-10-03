import { AdminRequestError } from './admin-request'

const calculatedFields = ['match_points', 'placement_points', 'weekly_points', 'monthly_points']
function rejectCalculatedFields(value: Record<string, unknown>) {
  if (calculatedFields.some(key => Object.hasOwn(value, key))) {
    throw new AdminRequestError('Points must be calculated by the database.')
  }
}

function text(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new AdminRequestError(`${label} must contain 1–${max} characters without control characters.`)
  }
  return value.trim()
}

function number(value: unknown, label: string, min: number, step = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > 1_000_000
    || !Number.isInteger(value / step)) {
    throw new AdminRequestError(`Invalid ${label}.`)
  }
  return value
}

export function validateResults(body: Record<string, unknown>) {
  rejectCalculatedFields(body)
  const name = text(body.name, 'Tournament name', 200)
  const date = body.tournament_date
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || date < '0001-01-01' || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new AdminRequestError('Enter a valid tournament date.')
  }
  let challonge_url = ''
  if (body.challonge_url !== undefined && body.challonge_url !== '') {
    challonge_url = text(body.challonge_url, 'Challonge URL', 2048)
    let url: URL
    try { url = new URL(challonge_url) } catch { throw new AdminRequestError('Enter a valid Challonge URL.') }
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || (url.hostname !== 'challonge.com' && !url.hostname.endsWith('.challonge.com'))) {
      throw new AdminRequestError('Enter an HTTPS challonge.com URL.')
    }
  }
  if (!Array.isArray(body.results) || body.results.length < 1 || body.results.length > 1000) {
    throw new AdminRequestError('Enter between 1 and 1000 player results.')
  }
  const names = new Set<string>()
  const placements = new Set<number>()
  const results = body.results.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AdminRequestError('Invalid player result.')
    const row = value as Record<string, unknown>
    rejectCalculatedFields(row)
    const playerName = text(row.name, 'Player name', 200)
    const key = playerName.toLocaleLowerCase('en-US')
    if (names.has(key)) throw new AdminRequestError(`Player ${playerName} appears more than once.`)
    names.add(key)
    const placement = number(row.placement, 'placement', 1)
    if (placements.has(placement)) throw new AdminRequestError(`Placement ${placement} is entered more than once.`)
    placements.add(placement)
    return {
      name: playerName, placement,
      wins: number(row.wins ?? 0, 'wins', 0),
      losses: number(row.losses ?? 0, 'losses', 0),
      ties: number(row.ties ?? 0, 'ties', 0),
      tiebreak: number(row.tiebreak ?? 0, 'tiebreak', -1_000_000, 0.5),
      buchholz: number(row.buchholz ?? 0, 'Buchholz', -1_000_000, 0.5),
      point_diff: number(row.point_diff ?? 0, 'point differential', -1_000_000),
    }
  })
  return { name, tournament_date: date, challonge_url, results }
}
