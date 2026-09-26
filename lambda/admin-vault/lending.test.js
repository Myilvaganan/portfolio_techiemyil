import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { createLendingApi, sanitizeEntry } = require('./lending.js')

function fakeS3() {
  const store = new Map()
  let v = 0
  return {
    send: async (cmd) => {
      const name = cmd.constructor.name
      const { Key, Body, IfMatch, IfNoneMatch } = cmd.input
      if (name === 'GetObjectCommand') {
        const o = store.get(Key)
        if (!o) throw Object.assign(new Error('x'), { name: 'NoSuchKey' })
        return { ETag: o.etag, Body: { transformToString: async () => o.body } }
      }
      const o = store.get(Key)
      if ((IfMatch && (!o || o.etag !== IfMatch)) || (IfNoneMatch && o)) throw Object.assign(new Error('p'), { $metadata: { httpStatusCode: 412 } })
      store.set(Key, { body: Body, etag: `"${++v}"` })
      return {}
    },
  }
}

const entry = (over = {}) => ({ name: 'Ravi', amount: 650000, date: '2024-05-01', repayments: [], ...over })
const call = (api, method, payload, query) => api.route({ method, path: '/admin/lending', payload, query })

describe('lending api', () => {
  it('validates what comes from the browser', () => {
    expect(sanitizeEntry(entry({ name: ' ' }), 'now').error).toMatch(/name/)
    expect(sanitizeEntry(entry({ amount: 0 }), 'now').error).toMatch(/amount/)
    expect(sanitizeEntry(entry({ date: '2024-13-40' }), 'now').error).toMatch(/date/)
    expect(sanitizeEntry(entry({ interestRatePct: 150 }), 'now').error).toMatch(/interest/)
    const ok = sanitizeEntry(entry({ repayments: [{ date: '2024-06-01', amount: 10000 }, { date: 'bad', amount: 5 }, { date: '2024-05-15', amount: -3 }] }), 'now')
    expect(ok.value.repayments).toHaveLength(1)
  })

  it('creates, updates (keeping the id) and deletes entries', async () => {
    const api = createLendingApi({ s3: fakeS3(), bucket: 'b' })
    const created = await call(api, 'POST', { entry: entry({ passThrough: { loanAmount: 1500000, ratePct: 9.99, tenureMonths: 72, firstEmiDate: '2024-06-05' } }) })
    expect(created.statusCode).toBe(200)
    const [saved] = created.body.entries
    expect(saved.passThrough).toEqual({ loanAmount: 1500000, ratePct: 9.99, tenureMonths: 72, firstEmiDate: '2024-06-05' })
    const edited = await call(api, 'POST', { entry: { ...saved, repayments: [{ date: '2024-07-05', amount: 12000, note: 'July' }] } })
    expect(edited.body.entries).toHaveLength(1)
    expect(edited.body.entries[0]).toMatchObject({ id: saved.id, createdAt: saved.createdAt })
    expect(edited.body.entries[0].repayments[0].amount).toBe(12000)
    expect((await call(api, 'GET')).body.entries).toHaveLength(1)
    expect((await call(api, 'DELETE', undefined, { id: saved.id })).body.entries).toEqual([])
  })

  it('drops an incomplete pass-through loan instead of saving half of it', async () => {
    const api = createLendingApi({ s3: fakeS3(), bucket: 'b' })
    const r = await call(api, 'POST', { entry: entry({ passThrough: { loanAmount: 1500000, ratePct: 9.99 } }) })
    expect(r.body.entries[0].passThrough).toBeNull()
  })

  it('ignores other paths', async () => {
    const api = createLendingApi({ s3: fakeS3(), bucket: 'b' })
    expect(await api.route({ method: 'GET', path: '/admin/other' })).toBeNull()
  })
})
