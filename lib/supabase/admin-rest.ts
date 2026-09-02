type RestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  prefer?: string
  timeoutMs?: number
  retries?: number
}

export class SupabaseRestError extends Error {
  status?: number
  stage?: string
  detail?: string

  constructor(message: string, options?: { status?: number; stage?: string; detail?: string }) {
    super(message)
    this.name = 'SupabaseRestError'
    this.status = options?.status
    this.stage = options?.stage
    this.detail = options?.detail
  }
}

function config() {
  const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const key = (process.env.SUPABASE_SECRET_KEY || '').trim()

  if (!rawUrl) throw new SupabaseRestError('NEXT_PUBLIC_SUPABASE_URL is missing in Vercel.')
  if (!key) throw new SupabaseRestError('SUPABASE_SECRET_KEY is missing in Vercel.')

  // Accept either the project URL or an accidentally pasted /rest/v1 URL.
  const projectUrl = rawUrl
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/i, '')

  if (!/^https:\/\/[^/]+\.supabase\.co$/i.test(projectUrl)) {
    throw new SupabaseRestError(
      `Supabase URL looks invalid: ${projectUrl}. Expected https://<project-ref>.supabase.co`,
    )
  }

  return {
    baseUrl: `${projectUrl}/rest/v1`,
    key,
  }
}

function describeFetchError(error: unknown) {
  if (!(error instanceof Error)) return String(error || 'Unknown fetch error')

  const cause = (error as Error & { cause?: unknown }).cause
  if (cause && typeof cause === 'object') {
    const c = cause as { code?: unknown; message?: unknown; errno?: unknown; syscall?: unknown }
    const parts = [
      error.message,
      c.code ? `code=${String(c.code)}` : '',
      c.errno ? `errno=${String(c.errno)}` : '',
      c.syscall ? `syscall=${String(c.syscall)}` : '',
      c.message ? `cause=${String(c.message)}` : '',
    ].filter(Boolean)
    return parts.join(' | ')
  }

  return error.message
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function supabaseRest<T = unknown>(
  path: string,
  options: RestOptions = {},
  stage = 'database',
): Promise<T> {
  const { baseUrl, key } = config()
  const method = options.method || 'GET'
  const timeoutMs = options.timeoutMs ?? 20_000
  const retries = options.retries ?? 2

  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const headers: Record<string, string> = {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      }

      if (options.body !== undefined) headers['Content-Type'] = 'application/json'
      if (options.prefer) headers.Prefer = options.prefer

      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        cache: 'no-store',
      })

      const text = await response.text()
      let payload: unknown = null
      if (text) {
        try { payload = JSON.parse(text) } catch { payload = text }
      }

      if (!response.ok) {
        const detail = typeof payload === 'object' && payload && 'message' in payload
          ? String((payload as { message?: unknown }).message || text)
          : text || response.statusText

        // Retry temporary server/rate-limit errors only.
        if ((response.status === 429 || response.status >= 500) && attempt < retries) {
          await sleep(300 * (attempt + 1))
          continue
        }

        throw new SupabaseRestError(
          `Supabase HTTP ${response.status}: ${detail}`,
          { status: response.status, stage, detail },
        )
      }

      return payload as T
    } catch (error) {
      lastError = error

      if (error instanceof SupabaseRestError) throw error

      const message = error instanceof DOMException && error.name === 'AbortError'
        ? `Request timed out after ${timeoutMs / 1000}s`
        : describeFetchError(error)

      if (attempt < retries) {
        await sleep(300 * (attempt + 1))
        continue
      }

      throw new SupabaseRestError(
        `Unable to reach Supabase after ${retries + 1} attempts: ${message}`,
        { stage, detail: message },
      )
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
