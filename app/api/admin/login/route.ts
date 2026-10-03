import { NextResponse } from 'next/server'
import { adminCredentials, setAdminCookie } from '@/lib/admin-auth'
import { passwordMatches } from '@/lib/admin-session'
import { AdminRequestError, readAdminJson } from '@/lib/admin-request'
import { takeLoginAttempt } from '@/lib/admin-rate-limit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await readAdminJson(request, 4096)
    const { password } = adminCredentials()
    const retryAfter = takeLoginAttempt(request)
    if (retryAfter) {
      return NextResponse.json({ error: 'Too many login attempts. Try again later.' }, {
        status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' },
      })
    }
    if (typeof body.password !== 'string' || body.password.length > 1024
      || !passwordMatches(body.password, password)) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
    }
    await setAdminCookie()
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof AdminRequestError ? error.message : 'Admin authentication is not configured.',
    }, { status: error instanceof AdminRequestError ? error.status : 503 })
  }
}
