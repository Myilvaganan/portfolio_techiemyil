import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { buildAlerts, istDate } = require('./push')

describe('push alerts', () => {
  it('uses the Indian date', () => {
    expect(istDate(new Date('2026-09-29T20:00:00Z'))).toBe('2026-09-30')
  })

  it('reminds about card bills due within three days, newest statement per card', () => {
    const a = buildAlerts({ today: '2026-10-01', slot: 'morning', cardStatements: [
      { cardLast4: '7003', cardName: 'ICICI', dueDate: '2026-09-02', totalDue: 5000 },
      { cardLast4: '7003', cardName: 'ICICI', dueDate: '2026-10-03', totalDue: 10675 },
      { cardLast4: '5001', dueDate: '2026-10-20', totalDue: 900 },
    ] })
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ title: 'Card bill due in 2 days', url: '/credit-cards' })
  })

  it('sends life-admin deadlines in the morning only', () => {
    const lifeItems = [{ id: 'p1', title: 'Car insurance', dueDate: '2026-10-02', notes: '' }, { id: 'p2', title: 'Passport', dueDate: '2027-01-01' }]
    expect(buildAlerts({ today: '2026-10-01', slot: 'morning', lifeItems }).map((x) => x.title)).toEqual(['Due in 1 day: Car insurance'])
    expect(buildAlerts({ today: '2026-10-01', slot: 'evening', lifeItems })).toEqual([])
  })

  it('flags a broken daily loss limit in the evening', () => {
    const trades = [{ date: '2026-10-01', grossPnl: -6000, fees: 100 }, { date: '2026-10-01', grossPnl: 500, fees: 0 }]
    expect(buildAlerts({ today: '2026-10-01', slot: 'evening', trades, dailyLossLimit: 5000 })[0].title).toBe('Daily loss limit broken')
    expect(buildAlerts({ today: '2026-10-01', slot: 'evening', trades, dailyLossLimit: 8000 })).toEqual([])
  })
})

describe('android (FCM) devices', () => {
  const { createPushApi } = require('./push')
  const { createFcm } = require('./fcm')

  function memS3(initial = {}) {
    const store = { ...initial }
    return {
      store,
      send: async (cmd) => {
        const { Key, Body } = cmd.input
        if (cmd.constructor.name === 'PutObjectCommand') { store[Key] = Body; return {} }
        if (!(Key in store)) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' })
        return { Body: { transformToString: async () => store[Key] } }
      },
    }
  }
  const SA = '_data/push/fcm-service-account.json'
  const TOKENS = '_data/push/fcm-tokens.json'
  const token = 'dev1:' + 'a'.repeat(40)

  it('registers a device, sends to it and drops it once Firebase says it is gone', async () => {
    const s3 = memS3({ [SA]: JSON.stringify({ private_key: 'k', project_id: 'p', client_email: 'e' }) })
    const results = ['ok', 'gone']
    const sent = []
    const api = createPushApi({ s3, bucket: 'b', fcmFactory: () => ({ send: async (t, a) => { sent.push([t, a.title]); return results.shift() } }) })
    expect((await api.route({ method: 'POST', path: '/admin/push/fcm/register', payload: { token } })).statusCode).toBe(200)
    expect(JSON.parse(s3.store[TOKENS])).toEqual([token])
    expect((await api.route({ method: 'POST', path: '/admin/push/test', payload: {} })).body.sent).toBe(1)
    await api.route({ method: 'POST', path: '/admin/push/test', payload: {} })
    expect(JSON.parse(s3.store[TOKENS])).toEqual([])
    expect(sent[0]).toEqual([token, 'Notifications are on'])
  })

  it('refuses to register when no service account is uploaded, and rejects bad tokens', async () => {
    const api = createPushApi({ s3: memS3(), bucket: 'b' })
    expect((await api.route({ method: 'POST', path: '/admin/push/fcm/register', payload: { token } })).statusCode).toBe(503)
    expect((await api.route({ method: 'POST', path: '/admin/push/fcm/register', payload: { token: 'x' } })).statusCode).toBe(400)
  })

  it('signs a token request and sends an HTTP v1 message', async () => {
    const { privateKey } = require('crypto').generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
    const calls = []
    const fetchImpl = async (url, opts) => {
      calls.push([url, opts])
      if (url.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) }
      return url.includes('/messages:send') && JSON.parse(opts.body).message.token === 'gone' ? { ok: false, status: 404, json: async () => ({ error: { status: 'NOT_FOUND' } }) } : { ok: true, json: async () => ({}) }
    }
    const fcm = createFcm({ serviceAccount: { private_key: privateKey, project_id: 'proj', client_email: 'sa@x' }, fetchImpl })
    expect(await fcm.send('t1', { title: 'T', body: 'B', url: '/x', tag: 'g' })).toBe('ok')
    expect(await fcm.send('gone', { title: 'T', body: 'B' })).toBe('gone')
    expect(calls.filter(([u]) => u.includes('oauth2'))).toHaveLength(1)
    const [url, opts] = calls[1]
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/proj/messages:send')
    expect(opts.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(opts.body).message).toMatchObject({ token: 't1', notification: { title: 'T', body: 'B' }, data: { url: '/x' } })
  })
})
