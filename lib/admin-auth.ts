import crypto from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'ct_admin'

function tokenFor(password: string) {
  return crypto.createHash('sha256').update(password).digest('hex')
}

export async function isAdmin() {
  const password = process.env.ADMIN_PASSWORD
  if (!password) return false
  const store = await cookies()
  return store.get(COOKIE_NAME)?.value === tokenFor(password)
}

export async function setAdminCookie() {
  const password = process.env.ADMIN_PASSWORD
  if (!password) throw new Error('ADMIN_PASSWORD is not configured')
  const store = await cookies()
  store.set(COOKIE_NAME, tokenFor(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function clearAdminCookie() {
  const store = await cookies()
  store.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
}
