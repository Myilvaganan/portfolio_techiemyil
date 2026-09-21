import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'

// Drives the real entry point with a signed admin token and a fake Kite, so the routing, auth and error mapping are
// exercised together. Env must be set before the module is first required.
const ENV = { S3_BUCKET: 'b', ADMIN_JWT_SECRET: 'test-secret', ADMIN_USERNAME: 'u', ADMIN_PASSWORD: 'p', KITE_API_KEY: 'key123', KITE_API_SECRET: 'sec456' }
const saved = {}
let handler

const b64 = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function adminToken() {
  const data = `${b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64(JSON.stringify({ sub: 'u', exp: Date.now() + 60_000 }))}`
  return `${data}.${b64(crypto.createHmac('sha256', ENV.ADMIN_JWT_SECRET).update(data).digest())}`
}

function call(path, body, { token = adminToken() } = {}) {
  return handler({
    requestContext: { http: { method: 'POST', path } },
    rawPath: path,
    headers: { origin: 'http://localhost:5173', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  })
}

const kiteOk = (data) => ({ ok: true, status: 200, json: async () => ({ status: 'success', data }) })
const kiteFail = (status, error_type, message = 'nope') => ({ ok: false, status, json: async () => ({ status: 'error', error_type, message }) })

const TRADE = {
  trade_id: '55123',
  order_id: '2409210001',
  exchange: 'NFO',
  tradingsymbol: 'NIFTY2692325000CE',
  transaction_type: 'BUY',
  quantity: 75,
  average_price: 101.5,
  fill_timestamp: '2026-09-21 09:20:45',
}

describe('POST /admin/kite/trades', () => {
  beforeAll(() => {
    for (const [k, v] of Object.entries(ENV)) {
      saved[k] = process.env[k]
      process.env[k] = v
    }
    handler = createRequire(import.meta.url)('./index.js').handler
  })
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    vi.unstubAllGlobals()
  })
  beforeEach(() => vi.unstubAllGlobals())

  it('returns today’s trades, calling Kite with the key and the visitor’s access token', async () => {
    const fetchMock = vi.fn(async () => kiteOk([TRADE]))
    vi.stubGlobal('fetch', fetchMock)

    const res = await call('/admin/kite/trades', { accessToken: 'acc-999' })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.trades).toEqual([TRADE])
    expect(typeof body.fetchedAt).toBe('string')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.kite.trade/trades')
    expect(init.headers.Authorization).toBe('token key123:acc-999')
    expect(init.headers['X-Kite-Version']).toBe('3')
  })

  it('returns an empty list when there were no trades today', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => kiteOk(null)))
    expect(JSON.parse((await call('/admin/kite/trades', { accessToken: 'a' })).body).trades).toEqual([])
  })

  it('tells the browser to reconnect when Kite rejects the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => kiteFail(403, 'TokenException', 'Incorrect api_key or access_token.')))

    const res = await call('/admin/kite/trades', { accessToken: 'stale' })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body)).toMatchObject({ code: 'token_expired' })
  })

  it('reports a generic failure without leaking Kite’s message or the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => kiteFail(500, 'NetworkException', 'upstream secret detail')))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await call('/admin/kite/trades', { accessToken: 'acc-999' })

    expect(res.statusCode).toBe(502)
    expect(res.body).not.toContain('upstream secret detail')
    expect(spy.mock.calls.flat().join(' ')).not.toContain('acc-999')
    spy.mockRestore()
  })

  it('requires an access token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await call('/admin/kite/trades', {})).statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires the admin login — nobody without a session can use your Kite token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await call('/admin/kite/trades', { accessToken: 'a' }, { token: null })).statusCode).toBe(401)
    expect((await call('/admin/kite/trades', { accessToken: 'a' }, { token: 'x.y.z' })).statusCode).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
