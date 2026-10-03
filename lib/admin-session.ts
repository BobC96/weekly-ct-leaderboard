import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SESSION_SECONDS = 8 * 60 * 60

export function passwordMatches(actual: string, expected: string) {
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(actual), digest(expected))
}

function signingKey(secret: string, password: string) {
  if (secret.length < 32 || !password) throw new Error('Admin authentication is not configured.')
  // Changing either credential invalidates existing sessions.
  return createHmac('sha256', secret).update('ct-admin-session-v1\0').update(password).digest()
}

export function createSession(secret: string, password: string, now = Math.floor(Date.now() / 1000)) {
  const key = signingKey(secret, password)
  const payload = Buffer.from(JSON.stringify({
    iat: now, exp: now + SESSION_SECONDS, nonce: randomBytes(16).toString('hex'),
  })).toString('base64url')
  const message = `v1.${payload}`
  return `${message}.${createHmac('sha256', key).update(message).digest('hex')}`
}

export function verifySession(token: string, secret: string, password: string, now = Math.floor(Date.now() / 1000)) {
  try {
    if (token.length > 1024) return false
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const [version, payload, signature] = parts
    if (version !== 'v1' || !/^[a-zA-Z0-9_-]+$/.test(payload) || !/^[a-f0-9]{64}$/.test(signature)) return false
    const expected = createHmac('sha256', signingKey(secret, password)).update(`${version}.${payload}`).digest()
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return false
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return Number.isSafeInteger(session.iat) && Number.isSafeInteger(session.exp)
      && session.iat <= now && session.exp > now
      && session.exp - session.iat === SESSION_SECONDS
      && typeof session.nonce === 'string' && /^[a-f0-9]{32}$/.test(session.nonce)
  } catch {
    return false
  }
}
