export class AdminRequestError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export function requireSameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin
    || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AdminRequestError('Invalid request origin.', 403)
  }
}

export async function readAdminJson(request: Request, limit = 1_048_576): Promise<Record<string, unknown>> {
  requireSameOrigin(request)
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new AdminRequestError('Expected application/json.', 415)
  }
  const length = request.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    throw new AdminRequestError('Request is too large.', 413)
  }
  const reader = request.body?.getReader()
  if (!reader) throw new AdminRequestError('Expected a JSON object.')
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel()
        throw new AdminRequestError('Request is too large.', 413)
      }
      chunks.push(value)
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid object')
    return body as Record<string, unknown>
  } catch (error) {
    if (error instanceof AdminRequestError) throw error
    throw new AdminRequestError('Expected a valid JSON object.')
  } finally {
    reader.releaseLock()
  }
}
