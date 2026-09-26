import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createTaxApi, sanitizeReturn } = require('./tax.js')

function fakeS3() {
  const objects = new Map()
  return {
    objects,
    async send(cmd) {
      const { Key, Body } = cmd.input
      switch (cmd.constructor.name) {
        case 'GetObjectCommand':
          if (!objects.has(Key)) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' })
          return { Body: { transformToString: async () => objects.get(Key) } }
        case 'PutObjectCommand':
          objects.set(Key, Body)
          return {}
        default:
          throw new Error(`unexpected ${cmd.constructor.name}`)
      }
    },
  }
}

const ret = (over = {}) => ({
  ay: '2026',
  form: 'ITR-3',
  filedOn: '2026-07-30',
  dueDate: '2026-08-31',
  regime: 'new',
  source: '834625380310726.json',
  income: { taxable: 2334690 },
  tax: { liability: 295020, total: 298853 },
  paid: { total: 298856 },
  ...over,
})

describe('sanitizeReturn', () => {
  it('keeps a valid return and normalises the fields it knows', () => {
    const r = sanitizeReturn(ret({ form: 'ITR-9', regime: 'weird', dueDate: 'soon' }))
    expect(r).toMatchObject({ ay: '2026', form: 'ITR-1', regime: 'unknown', dueDate: null, filedOn: '2026-07-30' })
    expect(r.tax.liability).toBe(295020)
  })

  it('rejects anything that is not a return', () => {
    expect(sanitizeReturn(null)).toBeNull()
    expect(sanitizeReturn(ret({ ay: 'abc' }))).toBeNull()
    expect(sanitizeReturn({ ay: '2026' })).toBeNull()
  })

  it('drops non-finite numbers, odd keys and over-long text', () => {
    const r = sanitizeReturn(ret({ income: { taxable: Infinity, 'bad key!': 1 }, source: '../../x.json'.repeat(50) }))
    expect(r.income.taxable).toBe(0)
    expect(r.income).not.toHaveProperty('bad key!')
    expect(r.source).not.toContain('/')
  })
})

describe('tax api', () => {
  const call = (api, method, extra = {}) => api({ method, path: '/admin/tax/returns', ...extra })

  it('stores one return per year and replaces a revised one', async () => {
    const api = createTaxApi({ s3: fakeS3(), bucket: 'b' })
    await call(api, 'POST', { payload: { returns: [ret({ ay: '2025' }), ret()] } })
    const revised = await call(api, 'POST', { payload: { return: ret({ paid: { total: 1 } }) } })
    expect(revised.body.returns.map((r) => r.ay)).toEqual(['2025', '2026'])
    expect(revised.body.returns[1].paid.total).toBe(1)
  })

  it('deletes a year and reports a missing one', async () => {
    const api = createTaxApi({ s3: fakeS3(), bucket: 'b' })
    await call(api, 'POST', { payload: { return: ret() } })
    expect((await call(api, 'DELETE', { query: { ay: '2026' } })).body.returns).toEqual([])
    expect((await call(api, 'DELETE', { query: { ay: '2026' } })).statusCode).toBe(404)
  })

  it('rejects an empty upload and ignores other paths', async () => {
    const api = createTaxApi({ s3: fakeS3(), bucket: 'b' })
    expect((await call(api, 'POST', { payload: { returns: [{}] } })).statusCode).toBe(400)
    expect(await api({ method: 'GET', path: '/admin/health/reports' })).toBeNull()
  })
})
