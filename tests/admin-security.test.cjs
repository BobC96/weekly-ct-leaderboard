const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { createHash } = require('node:crypto')
const root = path.resolve(__dirname, '..')

// Isolated module graph with explicit adapters: no Next server or live database.
function harness(rest = async () => { throw new Error('Unexpected database access') }) {
  const cache = new Map()
  const jar = new Map()
  const writes = []
  const mocks = {
    'next/headers': { cookies: async () => ({
      get: key => jar.has(key) ? { value: jar.get(key) } : undefined,
      set: (key, value, options) => { jar.set(key, value); writes.push({ key, value, options }) },
    }) },
    '@/lib/supabase/admin': {
      createAdminClient: () => { throw new Error('Unexpected database access') },
    },
  }
  function load(relative) {
    let file = path.resolve(root, relative)
    if (!file.endsWith('.ts')) file += '.ts'
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText
    const localRequire = id => {
      if (id === '@/lib/supabase/admin-rest') {
        return { ...load('lib/supabase/admin-rest'), supabaseRest: rest }
      }
      if (Object.hasOwn(mocks, id)) return mocks[id]
      if (id.startsWith('@/')) return load(id.slice(2))
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id))
      return require(id)
    }
    new Function('require', 'module', 'exports', code)(localRequire, module, module.exports)
    return module.exports
  }
  return { load, jar, writes }
}

const origin = 'https://league.example'

test('REST errors retain the database error code without retrying a unique conflict', async () => {
  const { supabaseRest, SupabaseRestError } = harness().load('lib/supabase/admin-rest')
  const originalFetch = global.fetch
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const oldKey = process.env.SUPABASE_SECRET_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SECRET_KEY = 'test-only-key'
  let calls = 0
  global.fetch = async () => {
    calls++
    return new Response(JSON.stringify({
      code: '23505',
      message: 'duplicate key value violates unique constraint "tournaments_unique_name_date"',
    }), { status: 409, headers: { 'content-type': 'application/json' } })
  }
  try {
    await assert.rejects(supabaseRest('/tournaments', { method: 'POST', body: {} }, 'tournament'),
      error => error instanceof SupabaseRestError && error.code === '23505'
        && error.status === 409 && error.stage === 'tournament')
    assert.equal(calls, 1)
  } finally {
    global.fetch = originalFetch
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY
    else process.env.SUPABASE_SECRET_KEY = oldKey
  }
})

test('duplicate tournament returns 409 and neither saves standings nor deletes the existing event', async () => {
  const stages = []
  const h = harness(async (url, options, stage) => {
    stages.push(stage)
    if (stage === 'players_read') return [{ id: 'player-id', name: 'Player A' }]
    if (stage === 'tournament') {
      const { SupabaseRestError } = h.load('lib/supabase/admin-rest')
      throw new SupabaseRestError('Unique conflict', {
        status: 409, code: '23505', stage,
        detail: 'duplicate key value violates unique constraint "tournaments_unique_name_date"',
      })
    }
    throw new Error('Unexpected write')
  })
  await h.load('lib/admin-auth').setAdminCookie()
  const response = await h.load('app/api/admin/save-results/route').POST(request(validResults()))
  assert.equal(response.status, 409)
  const body = await response.json()
  assert.equal(body.code, 'DUPLICATE_TOURNAMENT')
  assert.match(body.error, /already exists/)
  assert.deepEqual(stages, ['players_read', 'tournament'])
})

test('other database failures are not misreported as duplicate tournaments', async () => {
  for (const [code, constraint] of [
    ['23505', 'tournaments_pkey'],
    ['42501', 'tournaments_unique_name_date'],
  ]) {
    const stages = []
    const h = harness(async (url, options, stage) => {
      stages.push(stage)
      if (stage === 'players_read') return [{ id: 'player-id', name: 'Player A' }]
      const { SupabaseRestError } = h.load('lib/supabase/admin-rest')
      throw new SupabaseRestError('Other database failure', {
        status: 409, code, detail: 'constraint "' + constraint + '"',
      })
    })
    await h.load('lib/admin-auth').setAdminCookie()
    const oldError = console.error
    let response
    try {
      console.error = () => {}
      response = await h.load('app/api/admin/save-results/route').POST(request(validResults()))
    } finally { console.error = oldError }
    assert.equal(response.status, 500)
    assert.equal((await response.json()).code, undefined)
    assert.deepEqual(stages, ['players_read', 'tournament'])
  }
})
const secret = 'a'.repeat(64)
const password = 'test-only-admin-password'
process.env.ADMIN_SESSION_SECRET = secret
process.env.ADMIN_PASSWORD = password
process.env.NODE_ENV = 'production'
process.env.VERCEL = '1'

function request(body = {}, headers = {}, endpoint = '/api/admin/login') {
  return new Request(origin + endpoint, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}
function validResults() {
  return { name: 'CT Test', tournament_date: '2026-10-03', challonge_url: '',
    results: [{ name: 'Player A', placement: 1, wins: 4, losses: 1, ties: 0, tiebreak: 1.5, buchholz: 8, point_diff: -2 }] }
}

test('sessions expire on the server, reject tampering and reject old password-hash cookies', () => {
  const { createSession, verifySession, SESSION_SECONDS } = harness().load('lib/admin-session')
  const token = createSession(secret, password, 100)
  assert.equal(verifySession(token, secret, password, 100), true)
  assert.equal(verifySession(token, secret, password, 100 + SESSION_SECONDS - 1), true)
  assert.equal(verifySession(token, secret, password, 100 + SESSION_SECONDS), false)
  assert.equal(verifySession(token, secret, password, 99), false)
  assert.equal(verifySession(token.replace('v1.', 'v2.'), secret, password, 100), false)
  assert.equal(verifySession(token.slice(0, -1) + (token.endsWith('0') ? '1' : '0'), secret, password, 100), false)
  const [v, payload, sig] = token.split('.')
  const changed = JSON.parse(Buffer.from(payload, 'base64url'))
  changed.exp += 10000
  assert.equal(verifySession(v + '.' + Buffer.from(JSON.stringify(changed)).toString('base64url') + '.' + sig, secret, password, 100), false)
  assert.equal(verifySession(createHash('sha256').update(password).digest('hex'), secret, password, 100), false)
  for (const malformed of ['', 'v1.a.00', 'x'.repeat(2000)]) assert.equal(verifySession(malformed, secret, password), false)
})

test('credential rotation and environment separation invalidate sessions', () => {
  const { createSession, verifySession, passwordMatches } = harness().load('lib/admin-session')
  const token = createSession(secret, password)
  assert.equal(verifySession(token, 'b'.repeat(64), password), false)
  assert.equal(verifySession(token, secret, 'changed'), false)
  assert.equal(verifySession(token, '', password), false)
  assert.notEqual(createSession(secret, password), createSession(secret, password))
  assert.throws(() => createSession('short', password))
  assert.equal(passwordMatches(password, password), true)
  assert.equal(passwordMatches('wrong', password), false)
})

test('request guard rejects missing/cross origins, wrong type, malformed and oversized streamed JSON', async () => {
  const { readAdminJson } = harness().load('lib/admin-request')
  assert.deepEqual(await readAdminJson(request({ a: 1 })), { a: 1 })
  for (const [req, status] of [
    [request({}, { origin: 'https://evil.example' }), 403],
    [request({}, { origin: 'null' }), 403],
    [request({}, { 'sec-fetch-site': 'cross-site' }), 403],
    [request({}, { 'content-type': 'text/plain' }), 415],
    [request({}, { 'content-length': '2000000' }), 413],
    [request([]), 400],
    [new Request(origin, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{bad' }), 400],
    [new Request(origin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), 403],
  ]) await assert.rejects(readAdminJson(req), e => e.status === status)
  await assert.rejects(readAdminJson(request({ a: 'x'.repeat(500) }), 100), e => e.status === 413)
})

test('throttle reserves concurrent attempts, ignores spoofed forwarded-for and resets after window', async () => {
  const { takeLoginAttempt } = harness().load('lib/admin-rate-limit')
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) =>
    Promise.resolve(takeLoginAttempt(request({}, {
      'x-vercel-forwarded-for': '192.0.2.1', 'x-forwarded-for': '198.51.100.' + i,
    }), 1000))))
  assert.deepEqual(results, [0, 0, 0, 0, 0, 900])
  assert.equal(takeLoginAttempt(request({}, { 'x-vercel-forwarded-for': '192.0.2.2' }), 1000), 0)
  assert.equal(takeLoginAttempt(request({}, { 'x-vercel-forwarded-for': '192.0.2.1' }), 901000), 0)
})

test('login and logout issue and clear protected cookies; legacy cookies fail closed', async () => {
  const h = harness()
  const login = h.load('app/api/admin/login/route')
  const auth = h.load('lib/admin-auth')
  h.jar.set('ct_admin', createHash('sha256').update(password).digest('hex'))
  assert.equal(await auth.isAdmin(), false)
  assert.equal((await login.POST(request({ password: 'wrong' }))).status, 401)
  assert.equal((await login.POST(request({ password }))).status, 200)
  assert.equal(await auth.isAdmin(), true)
  assert.deepEqual(h.writes.at(-1).options, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 28800 })
  const logout = h.load('app/api/admin/logout/route')
  assert.equal((await logout.POST(request({}, { origin: 'https://evil.example' }))).status, 403)
  assert.equal(await auth.isAdmin(), true)
  assert.equal((await logout.POST(request())).status, 200)
  assert.equal(h.writes.at(-1).options.maxAge, 0)
  assert.equal(await auth.isAdmin(), false)
})

test('login fails closed without session configuration and returns retry information', async () => {
  const h = harness()
  const login = h.load('app/api/admin/login/route')
  delete process.env.ADMIN_SESSION_SECRET
  try {
    assert.equal((await login.POST(request({ password }))).status, 503)
    assert.equal(h.writes.length, 0)
    assert.equal(await h.load('lib/admin-auth').isAdmin(), false)
  } finally { process.env.ADMIN_SESSION_SECRET = secret }
  for (let i = 0; i < 5; i++) assert.equal((await login.POST(request({ password: 'wrong' }))).status, 401)
  const blocked = await login.POST(request({ password }))
  assert.equal(blocked.status, 429)
  assert.ok(Number(blocked.headers.get('retry-after')) > 0)
  assert.equal(h.writes.length, 0)
})

test('valid results preserve signed differences and fractional tiebreaks', () => {
  const { validateResults } = harness().load('lib/admin-results')
  assert.deepEqual(validateResults(validResults()), validResults())
  const body = validResults()
  body.tournament_date = '2024-02-29'
  assert.equal(validateResults(body).tournament_date, '2024-02-29')
})

test('results reject invalid dates, numbers, duplicate players/placements, and client score overrides', () => {
  const { validateResults } = harness().load('lib/admin-results')
  for (const date of ['2026-02-29', '2026-02-30', 'not-a-date', '0000-01-01']) {
    assert.throws(() => validateResults({ ...validResults(), tournament_date: date }))
  }
  for (const [key, value] of [['wins', -1], ['wins', 1.5], ['wins', '4'], ['wins', Infinity], ['placement', 0], ['ties', NaN], ['buchholz', 1.2]]) {
    const body = validResults(); body.results[0][key] = value
    assert.throws(() => validateResults(body))
  }
  for (const key of ['match_points', 'placement_points', 'weekly_points', 'monthly_points']) {
    assert.throws(() => validateResults({ ...validResults(), [key]: 100 }))
    const body = validResults(); body.results[0][key] = 100
    assert.throws(() => validateResults(body))
  }
  const names = validResults(); names.results.push({ ...names.results[0], name: ' player a ', placement: 2 })
  assert.throws(() => validateResults(names), /appears more than once/)
  const ranks = validResults(); ranks.results.push({ ...ranks.results[0], name: 'Player B' })
  assert.throws(() => validateResults(ranks), /Placement/)
  assert.throws(() => validateResults({ ...validResults(), results: [] }))
  assert.throws(() => validateResults({ ...validResults(), results: Array(1001).fill(validResults().results[0]) }))
  for (const url of ['https://evil.example/test', 'javascript:alert(1)', 'https://challonge.com.evil.example/t']) {
    assert.throws(() => validateResults({ ...validResults(), challonge_url: url }))
  }
})

for (const route of ['save-results', 'claims', 'import-challonge']) {
  test(route + ' rejects unauthenticated and cross-origin writes before database access', async () => {
    const h = harness()
    const endpoint = h.load('app/api/admin/' + route + '/route')
    assert.equal((await endpoint.POST(request(validResults()))).status, 401)
    await h.load('lib/admin-auth').setAdminCookie()
    assert.equal((await endpoint.POST(request(validResults(), { origin: 'https://evil.example' }))).status, 403)
    assert.equal((await endpoint.POST(request([], {}))).status, 400)
    if (route === 'save-results') {
      const body = validResults(); body.results[0].wins = -1
      assert.equal((await endpoint.POST(request(body))).status, 400)
    }
  })
}

test('valid save forwards only raw results and leaves score calculation to the database', async () => {
  const calls = []
  const h = harness(async (url, options, stage) => {
    calls.push({ url, options, stage })
    if (stage === 'players_read') return [{ id: 'player-id', name: 'Player A' }]
    if (stage === 'tournament') return [{ id: 'tournament-id' }]
    if (stage === 'standings') return null
    throw new Error('Unexpected stage: ' + stage)
  })
  await h.load('lib/admin-auth').setAdminCookie()
  const res = await h.load('app/api/admin/save-results/route').POST(request(validResults()))
  assert.equal(res.status, 200)
  assert.equal((await res.json()).players_saved, 1)
  assert.deepEqual(calls.map(c => c.stage), ['players_read', 'tournament', 'standings'])
  const row = calls.at(-1).options.body[0]
  assert.equal(row.point_diff, -2)
  assert.equal(row.tiebreak, 1.5)
  for (const key of ['match_points', 'placement_points', 'weekly_points']) assert.equal(Object.hasOwn(row, key), false)
})
