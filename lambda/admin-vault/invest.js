// Investment helpers: realised capital-gains summaries per financial year and custom reminders.
//
//   GET    /admin/invest/capital-gains           { years: { '2025-26': summary } }
//   POST   /admin/invest/capital-gains           { fy, summary }  replaces that year's summary
//   GET    /admin/invest/reminders               { reminders: [...] }
//   POST   /admin/invest/reminders               { title, date: YYYY-MM-DD, note? }
//   DELETE /admin/invest/reminders?id=
//
// Stored in the vault bucket: _data/invest/capital-gains.json and _data/invest/reminders.json. Writes use the
// object's ETag and retry on a conflict.

const crypto = require('crypto')
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')

const GAINS_KEY = '_data/invest/capital-gains.json'
const REMINDERS_KEY = '_data/invest/reminders.json'
const MAX_REMINDERS = 200
const MAX_AMOUNT = 1e11

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v

const AMOUNTS = ['intraday', 'stcg', 'ltcg', 'buyValue', 'sellValue']
const COUNTS = ['intradayTrades', 'stcgTrades', 'ltcgTrades']

function sanitizeGains(p) {
  if (!p || typeof p !== 'object') return { error: 'Invalid request.' }
  const fy = text(p.fy, 7)
  const m = /^(\d{4})-(\d{2})$/.exec(fy)
  if (!m || (Number(m[1]) + 1) % 100 !== Number(m[2]) || Number(m[1]) < 2000 || Number(m[1]) > 2100) return { error: 'Financial year must look like 2025-26.' }
  const s = p.summary
  if (!s || typeof s !== 'object') return { error: 'Missing summary.' }
  const value = { fy }
  for (const k of AMOUNTS) {
    if (typeof s[k] !== 'number' || !Number.isFinite(s[k]) || Math.abs(s[k]) > MAX_AMOUNT) return { error: `Invalid ${k}.` }
    value[k] = Math.round(s[k] * 100) / 100
  }
  for (const k of COUNTS) {
    if (!Number.isInteger(s[k]) || s[k] < 0 || s[k] > 1_000_000) return { error: `Invalid ${k}.` }
    value[k] = s[k]
  }
  return { value }
}

function sanitizeReminder(p) {
  if (!p || typeof p !== 'object') return { error: 'Invalid request.' }
  const title = text(p.title, 120)
  if (!title) return { error: 'Please add a title.' }
  if (!isDate(p.date)) return { error: 'Please pick a valid date.' }
  const note = text(p.note, 300)
  return { value: { title, date: p.date, ...(note ? { note } : {}) } }
}

function createInvestApi({ s3, bucket, now = () => new Date() }) {
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
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: JSON.stringify(next), ContentType: 'application/json', ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }) }))
        return next
      } catch (err) {
        const status = err && err.$metadata && err.$metadata.httpStatusCode
        if (status !== 412 && status !== 409 && !(err && err.name === 'PreconditionFailed')) throw err
      }
    }
    throw new Error('Too many concurrent updates.')
  }

  async function getGains() {
    const { data } = await readJson(GAINS_KEY)
    return { statusCode: 200, body: { years: (data && data.years) || {} } }
  }

  async function saveGains(payload) {
    const parsed = sanitizeGains(payload)
    if (parsed.error) return { statusCode: 400, body: { error: parsed.error } }
    const entry = { ...parsed.value, updatedAt: now().toISOString() }
    await update(GAINS_KEY, (doc) => ({ years: { ...((doc && doc.years) || {}), [entry.fy]: entry } }))
    return { statusCode: 200, body: { ok: true, summary: entry } }
  }

  async function listReminders() {
    const { data } = await readJson(REMINDERS_KEY)
    const reminders = [...((data && data.reminders) || [])].sort((a, b) => a.date.localeCompare(b.date))
    return { statusCode: 200, body: { reminders } }
  }

  async function addReminder(payload) {
    const parsed = sanitizeReminder(payload)
    if (parsed.error) return { statusCode: 400, body: { error: parsed.error } }
    const entry = { id: crypto.randomUUID(), ...parsed.value, createdAt: now().toISOString() }
    let full = false
    await update(REMINDERS_KEY, (doc) => {
      const list = (doc && doc.reminders) || []
      full = list.length >= MAX_REMINDERS
      return { reminders: full ? list : [...list, entry] }
    })
    if (full) return { statusCode: 400, body: { error: 'Too many reminders. Remove some first.' } }
    return { statusCode: 200, body: { reminder: entry } }
  }

  async function deleteReminder(query) {
    const id = text(query && query.id, 64)
    if (!id) return { statusCode: 400, body: { error: 'Missing id.' } }
    await update(REMINDERS_KEY, (doc) => ({ reminders: ((doc && doc.reminders) || []).filter((r) => r.id !== id) }))
    return { statusCode: 200, body: { ok: true } }
  }

  /** Returns null when the path is not an /admin/invest route. */
  async function route({ method, path, payload, query }) {
    if (path === '/admin/invest/capital-gains') {
      if (method === 'GET') return getGains()
      if (method === 'POST') return saveGains(payload)
    }
    if (path === '/admin/invest/reminders') {
      if (method === 'GET') return listReminders()
      if (method === 'POST') return addReminder(payload)
      if (method === 'DELETE') return deleteReminder(query)
    }
    return null
  }

  return { route }
}

module.exports = { createInvestApi, sanitizeGains, sanitizeReminder }
