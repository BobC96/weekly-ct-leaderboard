import { NextResponse } from 'next/server'
import { clearAdminCookie } from '@/lib/admin-auth'
import { AdminRequestError, requireSameOrigin } from '@/lib/admin-request'

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    await clearAdminCookie()
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof AdminRequestError ? error.message : 'Unable to sign out.' }, {
      status: error instanceof AdminRequestError ? error.status : 500,
    })
  }
}
