import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { createPlatformApi, sanitizeContact, sanitizeHit, addHit, summarizeAnalytics } = require('./platform.js')

function fakeS3() {
  const store = new Map()
  let version = 0
  const send = async (cmd) => {
    const name = cmd.constructor.name
    const { Key, Body, IfMatch, IfNoneMatch, Prefix = '' } = cmd.input
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
    if (name === 'ListObjectsV2Command') {
      return { Contents: [...store.entries()].filter(([k]) => k.startsWith(Prefix)).map(([k, o]) => ({ Key: k, Size: o.body.length })) }
    }
    throw new Error(name)
  }
  return { send, store }
}

describe('platform api', () => {
  it('validates contact messages and treats the honeypot as silent spam', () => {
    expect(sanitizeContact({ name: 'A', email: 'a@b.co', message: 'Hello there' }).value).toEqual({ name: 'A', email: 'a@b.co', message: 'Hello there' })
    expect(sanitizeContact({ name: 'A', email: 'nope', message: 'Hello there' }).error).toMatch(/email/)
    expect(sanitizeContact({ name: 'A', email: 'a@b.co', message: 'Hello', website: 'x' }).spam).toBe(true)
  })

  it('stores contact messages, lists, marks read and deletes them', async () => {
    const s3 = fakeS3()
    const api = createPlatformApi({ s3, bucket: 'b' })
    expect((await api.publicRoute({ method: 'POST', path: '/public/contact', payload: { name: 'A', email: 'a@b.co', message: 'Hi there!' }, ip: '1.1.1.1' })).statusCode).toBe(200)
    const list = await api.adminRoute({ method: 'GET', path: '/admin/contact' })
    expect(list.body.messages).toHaveLength(1)
    const id = list.body.messages[0].id
    await api.adminRoute({ method: 'POST', path: '/admin/contact/read', payload: { id, read: true } })
    expect((await api.adminRoute({ method: 'GET', path: '/admin/contact' })).body.messages[0].read).toBe(true)
    await api.adminRoute({ method: 'DELETE', path: '/admin/contact', query: { id } })
    expect((await api.adminRoute({ method: 'GET', path: '/admin/contact' })).body.messages).toHaveLength(0)
  })

  it('rate-limits contact messages per sender per hour', async () => {
    const api = createPlatformApi({ s3: fakeS3(), bucket: 'b' })
    const send = () => api.publicRoute({ method: 'POST', path: '/public/contact', payload: { name: 'A', email: 'a@b.co', message: 'Hi there!' }, ip: '9.9.9.9' })
    for (let i = 0; i < 5; i++) expect((await send()).statusCode).toBe(200)
    expect((await send()).statusCode).toBe(429)
  })

  it('counts page views without query strings, admin paths or full referrers', async () => {
    expect(sanitizeHit({ path: '/blog?x=1#y', referrer: 'https://www.google.com/search?q=me' })).toEqual({ path: '/blog', referrer: 'www.google.com' })
    expect(sanitizeHit({ path: '/admin/loans' })).toBeNull()
    const doc = addHit(addHit(null, '2026-09-26', { path: '/', referrer: '' }), '2026-09-26', { path: '/', referrer: 'x.com' })
    expect(summarizeAnalytics(doc)).toMatchObject({ total: 2, pages: [{ path: '/', views: 2 }], referrers: [{ host: 'x.com', views: 1 }] })

    const s3 = fakeS3()
    const api = createPlatformApi({ s3, bucket: 'b', now: () => new Date('2026-09-26T10:00:00Z') })
    await Promise.all([1, 2, 3].map(() => api.publicRoute({ method: 'POST', path: '/public/hit', payload: { path: '/' } })))
    const res = await api.adminRoute({ method: 'GET', path: '/admin/analytics', query: { month: '2026-09' } })
    expect(res.body.total).toBe(3)
  })

  it('backs up every data file and lists documents', async () => {
    const s3 = fakeS3()
    s3.store.set('_data/journal/settings.json', { body: '{"a":1}', etag: '"1"' })
    s3.store.set('_data/journal/mt5-reports/1/x.html', { body: '<html>', etag: '"2"' })
    s3.store.set('tax/2026__form.pdf', { body: 'pdf', etag: '"3"' })
    const res = await createPlatformApi({ s3, bucket: 'b' }).adminRoute({ method: 'GET', path: '/admin/backup' })
    expect(res.body.files).toEqual({ '_data/journal/settings.json': { a: 1 } })
    expect(res.body.documents.map((d) => d.key)).toEqual(['tax/2026__form.pdf'])
  })
})
