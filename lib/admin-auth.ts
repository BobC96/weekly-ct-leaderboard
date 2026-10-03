import { cookies } from 'next/headers'
import { createSession, verifySession, SESSION_SECONDS } from './admin-session'

const COOKIE_NAME = 'ct_admin'

export function adminCredentials() {
  const password = process.env.ADMIN_PASSWORD || ''
  const secret = process.env.ADMIN_SESSION_SECRET || ''
  if (!password || secret.length < 32) throw new Error('Admin authentication is not configured.')
  return { password, secret }
}

export async function isAdmin() {
  try {
    const { password, secret } = adminCredentials()
    const store = await cookies()
    return verifySession(store.get(COOKIE_NAME)?.value || '', secret, password)
  } catch {
    return false
  }
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
})

export async function setAdminCookie() {
  const { password, secret } = adminCredentials()
  const store = await cookies()
  store.set(COOKIE_NAME, createSession(secret, password), {
    ...cookieOptions(), maxAge: SESSION_SECONDS,
  })
}

export async function clearAdminCookie() {
  const store = await cookies()
  store.set(COOKIE_NAME, '', { ...cookieOptions(), maxAge: 0 })
}
