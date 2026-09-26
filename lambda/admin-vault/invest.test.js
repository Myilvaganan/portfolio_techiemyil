import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { createInvestApi, sanitizeGains, sanitizeReminder } = require('./invest.js')

function fakeS3() {
  const store = new Map()
  let version = 0
  const send = async (cmd) => {
    const name = cmd.constructor.name
    const { Key, Body, IfMatch, IfNoneMatch } = cmd.input
    if (name === 'GetObjectCommand') {
      const o = store.get(Key)
      if (!o) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' })
      return { ETag: o.etag, Body: { transformToString: async () => o.body } }
    }
    if (name === 'PutObjectCommand') {
      const o = store.get(Key)
      if ((IfMatch && (!o || o.etag !== IfMatch)) || (IfNoneMatch && o)) throw Object.assign(new Error('pre'), { $metadata: { httpStatusCode: 412 } })
      store.set(Key, { body: Body, etag: `"${++version}"` })
      return {}
    }
    throw new Error(name)
  }
  return { send, store }
}

const summary = { intraday: 500, stcg: -1000.456, ltcg: 290000, buyValue: 1, sellValue: 2, intradayTrades: 1, stcgTrades: 1, ltcgTrades: 2 }

describe('invest api', () => {
  it('validates capital-gains input', () => {
    expect(sanitizeGains({ fy: '2025-26', summary }).value.stcg).toBe(-1000.46)
    expect(sanitizeGains({ fy: '2025-27', summary }).error).toMatch(/Financial year/)
    expect(sanitizeGains({ fy: '2025-26', summary: { ...summary, ltcg: 'x' } }).error).toMatch(/ltcg/)
    expect(sanitizeGains({ fy: '2025-26', summary: { ...summary, ltcgTrades: -1 } }).error).toMatch(/ltcgTrades/)
    expect(sanitizeGains({ fy: '2025-26', summary: { ...summary, sellValue: 1e12 } }).error).toMatch(/sellValue/)
  })
  it('validates reminders', () => {
    expect(sanitizeReminder({ title: 'FD', date: '2026-12-01' }).value).toEqual({ title: 'FD', date: '2026-12-01' })
    expect(sanitizeReminder({ title: '', date: '2026-12-01' }).error).toBeTruthy()
    expect(sanitizeReminder({ title: 'x', date: '2026-02-31' }).error).toMatch(/date/)
  })
  it('stores a summary per financial year', async () => {
    const api = createInvestApi({ s3: fakeS3(), bucket: 'b' })
    expect((await api.route({ method: 'POST', path: '/admin/invest/capital-gains', payload: { fy: '2025-26', summary } })).statusCode).toBe(200)
    await api.route({ method: 'POST', path: '/admin/invest/capital-gains', payload: { fy: '2025-26', summary: { ...summary, ltcg: 5 } } })
    const got = await api.route({ method: 'GET', path: '/admin/invest/capital-gains' })
    expect(Object.keys(got.body.years)).toEqual(['2025-26'])
    expect(got.body.years['2025-26'].ltcg).toBe(5)
    expect((await api.route({ method: 'POST', path: '/admin/invest/capital-gains', payload: { fy: 'bad', summary } })).statusCode).toBe(400)
  })
  it('adds, lists sorted and deletes reminders', async () => {
    const api = createInvestApi({ s3: fakeS3(), bucket: 'b' })
    await api.route({ method: 'POST', path: '/admin/invest/reminders', payload: { title: 'B', date: '2026-12-01' } })
    const a = await api.route({ method: 'POST', path: '/admin/invest/reminders', payload: { title: 'A', date: '2026-11-01', note: 'n' } })
    const list = await api.route({ method: 'GET', path: '/admin/invest/reminders' })
    expect(list.body.reminders.map((r) => r.title)).toEqual(['A', 'B'])
    await api.route({ method: 'DELETE', path: '/admin/invest/reminders', query: { id: a.body.reminder.id } })
    expect((await api.route({ method: 'GET', path: '/admin/invest/reminders' })).body.reminders).toHaveLength(1)
    expect(await api.route({ method: 'GET', path: '/admin/other' })).toBeNull()
  })
})
