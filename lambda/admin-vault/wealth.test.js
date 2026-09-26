import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { createWealthApi, sanitizeSnapshot, sanitizeGoal, upsertSnapshot } = require('./wealth.js')

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

const snap = (month, portfolio = 100) => ({ month, assets: { portfolio, bank: 50 }, liabilities: { loans: 30, cards: 10 } })

describe('wealth api', () => {
  it('validates snapshots and derives net', () => {
    expect(sanitizeSnapshot(snap('2026-09'), 'now').value.net).toBe(110)
    expect(sanitizeSnapshot(snap('2026-13'), 'now').error).toBeTruthy()
    expect(sanitizeSnapshot({ ...snap('2026-09'), assets: { portfolio: 'x', bank: 1 } }, 'now').error).toBeTruthy()
  })

  it('upserts one snapshot per month and caps history', () => {
    const list = upsertSnapshot([{ month: '2026-08' }], { month: '2026-09' })
    expect(upsertSnapshot(list, { month: '2026-08', net: 1 })).toEqual([{ month: '2026-08', net: 1 }, { month: '2026-09' }])
    const many = Array.from({ length: 300 }, (_, i) => ({ month: `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}` }))
    expect(upsertSnapshot(many, { month: '2100-01' })).toHaveLength(240)
  })

  it('stores snapshots through the route', async () => {
    const api = createWealthApi({ s3: fakeS3(), bucket: 'b' })
    await api.route({ method: 'POST', path: '/admin/wealth/snapshots', payload: snap('2026-08') })
    await api.route({ method: 'POST', path: '/admin/wealth/snapshots', payload: snap('2026-08', 200) })
    const bad = await api.route({ method: 'POST', path: '/admin/wealth/snapshots', payload: { month: 'x' } })
    expect(bad.statusCode).toBe(400)
    const res = await api.route({ method: 'GET', path: '/admin/wealth/snapshots' })
    expect(res.body.snapshots).toHaveLength(1)
    expect(res.body.snapshots[0].net).toBe(210)
    expect(await api.route({ method: 'GET', path: '/nope' })).toBeNull()
  })

  it('validates, creates, edits and deletes goals', async () => {
    expect(sanitizeGoal({ name: '', targetAmount: 5, targetDate: '2030-01-01' }).error).toBeTruthy()
    expect(sanitizeGoal({ name: 'A', targetAmount: -1, targetDate: '2030-01-01' }).error).toBeTruthy()
    expect(sanitizeGoal({ name: 'A', targetAmount: 5, targetDate: 'soon' }).error).toBeTruthy()
    expect(sanitizeGoal({ name: 'A', targetAmount: 5, targetDate: '2030-01-01', kind: 'weird' }).value.kind).toBe('other')
    const api = createWealthApi({ s3: fakeS3(), bucket: 'b' })
    const created = await api.route({ method: 'POST', path: '/admin/wealth/goals', payload: { name: 'House', targetAmount: 1000, targetDate: '2030-01-01', kind: 'house' } })
    const id = created.body.goals[0].id
    expect(id).toBeTruthy()
    const edited = await api.route({ method: 'POST', path: '/admin/wealth/goals', payload: { id, name: 'Home', targetAmount: 2000, targetDate: '2031-01-01', kind: 'house' } })
    expect(edited.body.goals).toHaveLength(1)
    expect(edited.body.goals[0].name).toBe('Home')
    const del = await api.route({ method: 'DELETE', path: '/admin/wealth/goals', query: { id } })
    expect(del.body.goals).toEqual([])
  })
})
