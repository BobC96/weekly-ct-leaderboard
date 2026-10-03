import { createHash } from 'node:crypto'

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5
const MAX_KEYS = 10_000
const buckets = new Map<string, { count: number; expires: number }>()

// Best-effort per-instance protection. Use a Vercel WAF rate limit as well:
// instances do not share this map and restarts clear it.
export function takeLoginAttempt(request: Request, now = Date.now()) {
  for (const [key, bucket] of buckets) if (bucket.expires <= now) buckets.delete(key)
  // Vercel overwrites this header. Do not trust arbitrary x-forwarded-for values.
  const address = process.env.VERCEL === '1'
    ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || 'unknown'
    : 'local'
  const hash = createHash('sha256').update(address).digest('hex')
  const key = !buckets.has(hash) && buckets.size >= MAX_KEYS ? 'overflow' : hash
  const bucket = buckets.get(key) || { count: 0, expires: now + WINDOW_MS }
  if (bucket.count >= MAX_ATTEMPTS) return Math.max(1, Math.ceil((bucket.expires - now) / 1000))
  bucket.count++
  buckets.set(key, bucket)
  return 0
}
