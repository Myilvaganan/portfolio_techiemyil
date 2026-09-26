// Money other people owe me.
//
//   GET    /admin/lending             { entries }
//   POST   /admin/lending  { entry }  create (no id) or replace (id)      { entries }
//   DELETE /admin/lending?id=                                              { entries }
//
// An entry is one person / one amount: what I lent, when, any agreed simple interest, the repayments received, and
// optionally the loan I took out to lend it (for the pass-through calculator). Stored in _data/lending/entries.json with
// conditional (ETag) writes. Everything from the browser is re-validated here.

const crypto = require('crypto')
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')

const KEY = '_data/lending/entries.json'
const MAX_ENTRIES = 500
const MAX_REPAYMENTS = 600
const MAX_AMOUNT = 1e10

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const money = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_AMOUNT ? Math.round(v * 100) / 100 : null)
const validDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d
const newId = () => crypto.randomBytes(6).toString('hex')
const okId = (id) => typeof id === 'string' && /^[a-z0-9]{6,24}$/.test(id)

function sanitizeRepayment(r) {
  if (!r || typeof r !== 'object') return null
  const amount = money(r.amount)
  if (!amount || !validDate(r.date)) return null
  return { id: okId(r.id) ? r.id : newId(), date: r.date, amount, note: text(r.note, 120) }
}

function sanitizePassThrough(p) {
  if (!p || typeof p !== 'object') return null
  const loanAmount = money(p.loanAmount)
  const ratePct = typeof p.ratePct === 'number' && p.ratePct >= 0 && p.ratePct <= 60 ? Math.round(p.ratePct * 1000) / 1000 : null
  const tenureMonths = Number.isInteger(p.tenureMonths) && p.tenureMonths > 0 && p.tenureMonths <= 600 ? p.tenureMonths : null
  if (!loanAmount || ratePct === null || !tenureMonths || !validDate(p.firstEmiDate)) return null
  return { loanAmount, ratePct, tenureMonths, firstEmiDate: p.firstEmiDate }
}

function sanitizeEntry(raw, nowIso, previous) {
  if (!raw || typeof raw !== 'object') return { error: 'Invalid entry.' }
  const name = text(raw.name, 80)
  if (!name) return { error: 'Add the person’s name.' }
  const amount = money(raw.amount)
  if (!amount) return { error: 'Add the amount lent.' }
  if (!validDate(raw.date)) return { error: 'Add the date it was lent.' }
  const rate = raw.interestRatePct === undefined || raw.interestRatePct === null || raw.interestRatePct === '' ? 0 : raw.interestRatePct
  if (typeof rate !== 'number' || rate < 0 || rate > 100) return { error: 'The interest rate must be between 0 and 100.' }
  const repayments = (Array.isArray(raw.repayments) ? raw.repayments : []).slice(0, MAX_REPAYMENTS).map(sanitizeRepayment).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date))
  const dueDate = raw.dueDate ? (validDate(raw.dueDate) ? raw.dueDate : null) : ''
  if (dueDate === null) return { error: 'The due date is not valid.' }
  return {
    value: {
      id: previous ? previous.id : okId(raw.id) ? raw.id : newId(),
      name,
      phone: text(raw.phone, 30),
      amount,
      date: raw.date,
      dueDate,
      interestRatePct: Math.round(rate * 1000) / 1000,
      note: text(raw.note, 400),
      repayments,
      passThrough: sanitizePassThrough(raw.passThrough),
      createdAt: previous ? previous.createdAt : nowIso,
      updatedAt: nowIso,
    },
  }
}

function createLendingApi({ s3, bucket, now = () => new Date() }) {
  async function read() {
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: KEY }))
      return { data: JSON.parse(await out.Body.transformToString()), etag: out.ETag }
    } catch (err) {
      if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) return { data: null, etag: null }
      throw err
    }
  }

  async function update(change) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, etag } = await read()
      const result = change((data && data.entries) || [])
      if (result.error) return result
      try {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: KEY, Body: JSON.stringify({ entries: result.entries, updatedAt: now().toISOString() }), ContentType: 'application/json', ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }) }))
        return result
      } catch (err) {
        const status = err && err.$metadata && err.$metadata.httpStatusCode
        if (status !== 412 && status !== 409 && !(err && err.name === 'PreconditionFailed')) throw err
      }
    }
    throw new Error('Too many concurrent updates.')
  }

  async function route({ method, path, payload, query }) {
    if (path !== '/admin/lending') return null
    if (method === 'GET') return { statusCode: 200, body: { entries: (((await read()).data || {}).entries) || [] } }
    if (method === 'POST') {
      const nowIso = now().toISOString()
      const result = await update((list) => {
        const raw = payload && payload.entry
        const previous = raw && okId(raw.id) ? list.find((e) => e.id === raw.id) : null
        const s = sanitizeEntry(raw, nowIso, previous)
        if (s.error) return s
        if (!previous && list.length >= MAX_ENTRIES) return { error: `You can keep up to ${MAX_ENTRIES} entries.` }
        return { entries: previous ? list.map((e) => (e.id === previous.id ? s.value : e)) : [s.value, ...list] }
      })
      return result.error ? { statusCode: 400, body: { error: result.error } } : { statusCode: 200, body: { entries: result.entries } }
    }
    if (method === 'DELETE') {
      const id = text(query && query.id, 24)
      const result = await update((list) => ({ entries: list.filter((e) => e.id !== id) }))
      return { statusCode: 200, body: { entries: result.entries } }
    }
    return null
  }

  return { route }
}

module.exports = { createLendingApi, sanitizeEntry }
