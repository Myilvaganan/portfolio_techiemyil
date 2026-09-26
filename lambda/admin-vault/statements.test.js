import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createStatementsApi, normMerchant } = require('./statements.js')

// In-memory stand-in for S3: enough of Get/Put/List for the statements store.
function fakeS3() {
  const objects = new Map()
  return {
    objects,
    async send(cmd) {
      const { Key, Body, Prefix } = cmd.input
      switch (cmd.constructor.name) {
        case 'GetObjectCommand':
          if (!objects.has(Key)) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' })
          return { Body: { transformToByteArray: async () => new TextEncoder().encode(objects.get(Key)) } }
        case 'PutObjectCommand':
          objects.set(Key, typeof Body === 'string' ? Body : Body.toString())
          return {}
        case 'ListObjectsV2Command':
          return { Contents: [...objects.keys()].filter((k) => k.startsWith(Prefix)).map((k) => ({ Key: k })) }
        case 'DeleteObjectCommand':
          objects.delete(Key)
          return {}
        default:
          throw new Error(`unexpected ${cmd.constructor.name}`)
      }
    },
  }
}

const txn = (over = {}) => ({ date: '2026-08-01', description: 'Swiggy order', merchant: 'Swiggy', debit: 500, credit: 0, category: 'Groceries', ...over })

async function seedData(api, s3, { merchant = 'Swiggy', category = 'Groceries' } = {}) {
  const data = {
    statements: [{ id: 'abc123', kind: 'bank', accountKey: 'icici:1234' }],
    transactions: [
      { id: 'abc123-0', statementId: 'abc123', accountKey: 'icici:1234', ...txn({ merchant, category }) },
      { id: 'abc123-1', statementId: 'abc123', accountKey: 'icici:1234', ...txn({ merchant: 'Other Shop', category: 'Shopping' }) },
    ],
    insights: null,
  }
  s3.objects.set('_data/statements/bank/data.json', JSON.stringify(data))
  return data
}

describe('normMerchant', () => {
  it('trims and lowercases for a stable grouping key', () => {
    expect(normMerchant('  Swiggy  ')).toBe('swiggy')
    expect(normMerchant('SWIGGY')).toBe('swiggy')
  })
})

describe('category-override route', () => {
  it('recategorises every stored transaction from that merchant and reports how many changed', async () => {
    const s3 = fakeS3()
    const api = createStatementsApi({ s3, bucket: 'b' })
    await seedData(api, s3)

    const res = await api({ method: 'POST', path: '/admin/statements/category-override', payload: { kind: 'bank', merchantKey: 'Swiggy', category: 'Food & Dining' }, query: {} })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, updated: 1 })

    const saved = JSON.parse(s3.objects.get('_data/statements/bank/data.json'))
    expect(saved.transactions.find((t) => t.merchant === 'Swiggy').category).toBe('Food & Dining')
    expect(saved.transactions.find((t) => t.merchant === 'Other Shop').category).toBe('Shopping')
    expect(saved.categoryOverrides).toEqual({ swiggy: 'Food & Dining' })
  })

  it('matches the merchant key case- and whitespace-insensitively', async () => {
    const s3 = fakeS3()
    const api = createStatementsApi({ s3, bucket: 'b' })
    await seedData(api, s3, { merchant: '  SWIGGY  ' })

    const res = await api({ method: 'POST', path: '/admin/statements/category-override', payload: { kind: 'bank', merchantKey: 'swiggy', category: 'Food & Dining' }, query: {} })
    expect(res.body.updated).toBe(1)
  })

  it('rejects an unknown category or missing merchant', async () => {
    const s3 = fakeS3()
    const api = createStatementsApi({ s3, bucket: 'b' })
    await seedData(api, s3)

    const bad1 = await api({ method: 'POST', path: '/admin/statements/category-override', payload: { kind: 'bank', merchantKey: 'Swiggy', category: 'Not A Category' }, query: {} })
    expect(bad1.statusCode).toBe(400)

    const bad2 = await api({ method: 'POST', path: '/admin/statements/category-override', payload: { kind: 'bank', merchantKey: '', category: 'Groceries' }, query: {} })
    expect(bad2.statusCode).toBe(400)

    const bad3 = await api({ method: 'POST', path: '/admin/statements/category-override', payload: { kind: 'loan', merchantKey: 'Swiggy', category: 'Groceries' }, query: {} })
    expect(bad3.statusCode).toBe(400)
  })

  it('applies a saved override to transactions committed afterwards', async () => {
    const s3 = fakeS3()
    const api = createStatementsApi({ s3, bucket: 'b' })
    await seedData(api, s3)
    await api({ method: 'POST', path: '/admin/statements/category-override', payload: { kind: 'bank', merchantKey: 'Swiggy', category: 'Food & Dining' }, query: {} })

    s3.objects.set(
      '_data/statements/bank/newid123/text.json',
      JSON.stringify({ lines: ['x'], pages: 1, fileKey: '_data/statements/bank/newid123/statement.pdf' }),
    )
    const res = await api({
      method: 'POST',
      path: '/admin/statements/commit',
      payload: {
        kind: 'bank',
        id: 'newid123',
        filename: 'aug.pdf',
        meta: { bank: 'icici', accountLast4: '1234', periodFrom: '2026-09-01', periodTo: '2026-09-30' },
        transactions: [txn({ date: '2026-09-05', merchant: 'Swiggy', category: 'Groceries' })],
      },
      query: {},
    })
    expect(res.statusCode).toBe(200)
    const saved = JSON.parse(s3.objects.get('_data/statements/bank/data.json'))
    const added = saved.transactions.find((t) => t.date === '2026-09-05')
    expect(added.category).toBe('Food & Dining')
  })
})
