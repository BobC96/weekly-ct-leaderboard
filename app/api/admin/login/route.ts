import { NextResponse } from 'next/server'
import { setAdminCookie } from '@/lib/admin-auth'

export async function POST(request: Request) {
  const { password } = await request.json()
  const expected = process.env.ADMIN_PASSWORD

  if (!expected) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD is not configured in Vercel.' }, { status: 500 })
  }

  if (!password || password !== expected) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }

  await setAdminCookie()
  return NextResponse.json({ ok: true })
}
