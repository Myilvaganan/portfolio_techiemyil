import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { createFinanceApi, sanitizeBudget, sanitizeRule, sanitizeTag } = require('./finance.js')

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

describe('finance api', () => {
  it('validates input', () => {
    expect(sanitizeBudget({ category: 'Food', limit: 5000.4 }).value).toEqual({ category: 'Food', limit: 5000 })
    expect(sanitizeBudget({ category: 'Food', limit: -1 }).error).toBeTruthy()
    expect(sanitizeBudget({ category: '', limit: 1 }).error).toBeTruthy()
    expect(sanitizeRule({ match: 'a', category: 'Food' }).error).toBeTruthy()
    expect(sanitizeTag({ key: 'bad', tag: 'family' }).error).toBeTruthy()
    expect(sanitizeTag({ key: 'm:zomato', tag: 'x' }).error).toBeTruthy()
    expect(sanitizeTag({ key: 'm:zomato', tag: null }).value.tag).toBeNull()
  })

  it('sets and removes budgets', async () => {
    const api = createFinanceApi({ s3: fakeS3(), bucket: 'b' })
    await api.route({ method: 'POST', path: '/admin/finance/budgets', payload: { category: 'Food & Dining', limit: 8000 } })
    expect((await api.route({ method: 'GET', path: '/admin/finance/budgets' })).body.budgets).toEqual({ 'Food & Dining': 8000 })
    await api.route({ method: 'POST', path: '/admin/finance/budgets', payload: { category: 'Food & Dining', limit: 0 } })
    expect((await api.route({ method: 'GET', path: '/admin/finance/budgets' })).body.budgets).toEqual({})
    expect((await api.route({ method: 'POST', path: '/admin/finance/budgets', payload: { limit: 5 } })).statusCode).toBe(400)
  })

  it('adds, replaces and removes rules', async () => {
    const api = createFinanceApi({ s3: fakeS3(), bucket: 'b' })
    const p = '/admin/finance/rules'
    await api.route({ method: 'POST', path: p, payload: { add: { match: 'Zomato', category: 'Food & Dining' } } })
    const r = await api.route({ method: 'POST', path: p, payload: { add: { match: 'zomato', category: 'Shopping' } } })
    expect(r.body.rules).toHaveLength(1)
    expect(r.body.rules[0].category).toBe('Shopping')
    const gone = await api.route({ method: 'POST', path: p, payload: { remove: r.body.rules[0].id } })
    expect(gone.body.rules).toEqual([])
  })

  it('stores tags and ignores other paths', async () => {
    const api = createFinanceApi({ s3: fakeS3(), bucket: 'b' })
    await api.route({ method: 'POST', path: '/admin/finance/tags', payload: { key: 'm:amma', tag: 'family' } })
    expect((await api.route({ method: 'GET', path: '/admin/finance/tags' })).body.tags).toEqual({ 'm:amma': 'family' })
    await api.route({ method: 'POST', path: '/admin/finance/tags', payload: { key: 'm:amma', tag: null } })
    expect((await api.route({ method: 'GET', path: '/admin/finance/tags' })).body.tags).toEqual({})
    expect(await api.route({ method: 'GET', path: '/admin/other' })).toBeNull()
  })
})
