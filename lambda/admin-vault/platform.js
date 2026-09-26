// Whole-app routes: data backup, the public contact form and a cookieless page-view counter.
//
//   GET    /admin/backup              every _data/**.json file in one download, plus the document index
//   POST   /public/contact            { name, email, message, website }  (website is a honeypot; no auth)
//   GET    /admin/contact             messages, newest first
//   POST   /admin/contact/read        { id, read }
//   DELETE /admin/contact?id=
//   POST   /public/hit                { path, referrer }  (no auth; no IP, cookie or user agent is stored)
//   GET    /admin/analytics?month=YYYY-MM
//
// Stored in the vault bucket: _data/contact/messages.json and _data/analytics/YYYY-MM.json. Writes use the object's
// ETag (If-Match / If-None-Match) and retry on a conflict, so two requests at once never drop each other's update.

const crypto = require('crypto')
const { GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3')

const DATA_PREFIX = '_data/'
const CONTACT_KEY = '_data/contact/messages.json'
const MAX_MESSAGES = 1000
const MAX_BACKUP_BYTES = 5_000_000
const MAX_PATHS_PER_DAY = 200
const HOURLY_CONTACT_LIMIT = 5

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const isEmail = (v) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(v)

function sanitizeContact(p) {
  if (!p || typeof p !== 'object') return { error: 'Invalid request.' }
  if (text(p.website, 200)) return { spam: true }
  const name = text(p.name, 120)
  const email = text(p.email, 254)
  const message = text(p.message, 5000)
  if (!name) return { error: 'Please add your name.' }
  if (!isEmail(email)) return { error: 'Please add a valid email address.' }
  if (message.length < 5) return { error: 'Please write a short message.' }
  return { value: { name, email, message } }
}

// Paths are stored without query strings or fragments, and only the referrer's host is kept.
function sanitizeHit(p) {
  if (!p || typeof p !== 'object') return null
  const raw = text(p.path, 300)
  if (!raw.startsWith('/') || raw.startsWith('/admin')) return null
  const path = raw.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  if (!/^\/[A-Za-z0-9/_\-.]*$/.test(path)) return null
  let referrer = ''
  try {
    if (p.referrer) referrer = new URL(String(p.referrer)).hostname.slice(0, 100)
  } catch {
    referrer = ''
  }
  return { path, referrer }
}

function addHit(doc, date, hit) {
  const out = doc && typeof doc === 'object' ? doc : {}
  out.days = out.days || {}
  out.referrers = out.referrers || {}
  const day = (out.days[date] = out.days[date] || {})
  if (day[hit.path] !== undefined || Object.keys(day).length < MAX_PATHS_PER_DAY) day[hit.path] = (day[hit.path] || 0) + 1
  if (hit.referrer && Object.keys(out.referrers).length < 500) out.referrers[hit.referrer] = (out.referrers[hit.referrer] || 0) + 1
  return out
}

function summarizeAnalytics(doc) {
  const days = (doc && doc.days) || {}
  const byPath = {}
  const byDay = []
  for (const [date, paths] of Object.entries(days).sort(([a], [b]) => a.localeCompare(b))) {
    let total = 0
    for (const [path, n] of Object.entries(paths)) {
      byPath[path] = (byPath[path] || 0) + n
      total += n
    }
    byDay.push({ date, views: total })
  }
  const pages = Object.entries(byPath)
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
  const referrers = Object.entries((doc && doc.referrers) || {})
    .map(([host, views]) => ({ host, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 20)
  return { total: pages.reduce((s, p) => s + p.views, 0), byDay, pages, referrers }
}

function createPlatformApi({ s3, bucket, now = () => new Date() }) {
  const recentContacts = new Map()

  async function readJson(key) {
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      return { data: JSON.parse(await out.Body.transformToString()), etag: out.ETag }
    } catch (err) {
      if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) return { data: null, etag: null }
      throw err
    }
  }

  // Read, change and write back; if someone else wrote in between, S3 rejects the write (412) and we try again.
  async function update(key, change) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, etag } = await readJson(key)
      const next = change(data)
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: JSON.stringify(next),
            ContentType: 'application/json',
            ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }),
          }),
        )
        return next
      } catch (err) {
        const status = err && err.$metadata && err.$metadata.httpStatusCode
        if (status !== 412 && status !== 409 && !(err && err.name === 'PreconditionFailed')) throw err
      }
    }
    throw new Error('Too many concurrent updates.')
  }

  async function listAll(prefix) {
    const out = []
    let token
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }))
      out.push(...(page.Contents || []))
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    return out
  }

  async function backup() {
    const objects = await listAll('')
    const files = {}
    const skipped = []
    let bytes = 0
    for (const o of objects.filter((x) => x.Key.startsWith(DATA_PREFIX) && x.Key.endsWith('.json'))) {
      if (bytes + (o.Size || 0) > MAX_BACKUP_BYTES) {
        skipped.push(o.Key)
        continue
      }
      const { data } = await readJson(o.Key)
      files[o.Key] = data
      bytes += o.Size || 0
    }
    const documents = objects
      .filter((o) => !o.Key.startsWith(DATA_PREFIX) && !o.Key.endsWith('/'))
      .map((o) => ({ key: o.Key, size: o.Size || 0, lastModified: o.LastModified ? new Date(o.LastModified).toISOString() : null }))
    return { statusCode: 200, body: { generatedAt: now().toISOString(), files, documents, skipped } }
  }

  async function contact(payload, ip) {
    const parsed = sanitizeContact(payload)
    // A bot filling the hidden field gets the same "thanks" as a person, so it learns nothing.
    if (parsed.spam) return { statusCode: 200, body: { ok: true } }
    if (parsed.error) return { statusCode: 400, body: { error: parsed.error } }

    const hour = Math.floor(now().getTime() / 3_600_000)
    const who = crypto.createHash('sha256').update(`${ip || ''}:${hour}`).digest('hex')
    const count = (recentContacts.get(who) || 0) + 1
    recentContacts.set(who, count)
    if (recentContacts.size > 5000) recentContacts.clear()
    if (count > HOURLY_CONTACT_LIMIT) return { statusCode: 429, body: { error: 'Too many messages. Please try again later.' } }

    const entry = { id: crypto.randomUUID(), ...parsed.value, read: false, createdAt: now().toISOString() }
    await update(CONTACT_KEY, (doc) => ({ messages: [entry, ...((doc && doc.messages) || [])].slice(0, MAX_MESSAGES) }))
    return { statusCode: 200, body: { ok: true } }
  }

  async function listContacts() {
    const { data } = await readJson(CONTACT_KEY)
    return { statusCode: 200, body: { messages: (data && data.messages) || [] } }
  }

  async function markContact(payload) {
    const id = text(payload && payload.id, 64)
    if (!id) return { statusCode: 400, body: { error: 'Missing id.' } }
    await update(CONTACT_KEY, (doc) => ({ messages: ((doc && doc.messages) || []).map((m) => (m.id === id ? { ...m, read: Boolean(payload.read) } : m)) }))
    return { statusCode: 200, body: { ok: true } }
  }

  async function deleteContact(query) {
    const id = text(query && query.id, 64)
    if (!id) return { statusCode: 400, body: { error: 'Missing id.' } }
    await update(CONTACT_KEY, (doc) => ({ messages: ((doc && doc.messages) || []).filter((m) => m.id !== id) }))
    return { statusCode: 200, body: { ok: true } }
  }

  async function hit(payload) {
    const h = sanitizeHit(payload)
    if (!h) return { statusCode: 204, body: {} }
    const date = now().toISOString().slice(0, 10)
    await update(`_data/analytics/${date.slice(0, 7)}.json`, (doc) => addHit(doc, date, h))
    return { statusCode: 204, body: {} }
  }

  async function analytics(query) {
    const month = /^\d{4}-\d{2}$/.test((query && query.month) || '') ? query.month : now().toISOString().slice(0, 7)
    const { data } = await readJson(`_data/analytics/${month}.json`)
    return { statusCode: 200, body: { month, ...summarizeAnalytics(data) } }
  }

  /** Routes that need no login. Returns null when the path is not one of them. */
  async function publicRoute({ method, path, payload, ip }) {
    if (method === 'POST' && path === '/public/contact') return contact(payload, ip)
    if (method === 'POST' && path === '/public/hit') return hit(payload)
    return null
  }

  async function adminRoute({ method, path, payload, query }) {
    if (method === 'GET' && path === '/admin/backup') return backup()
    if (method === 'GET' && path === '/admin/contact') return listContacts()
    if (method === 'POST' && path === '/admin/contact/read') return markContact(payload)
    if (method === 'DELETE' && path === '/admin/contact') return deleteContact(query)
    if (method === 'GET' && path === '/admin/analytics') return analytics(query)
    return null
  }

  return { publicRoute, adminRoute }
}

module.exports = { createPlatformApi, sanitizeContact, sanitizeHit, addHit, summarizeAnalytics }
