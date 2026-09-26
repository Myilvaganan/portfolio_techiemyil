// Income-tax return storage for the admin dashboard.
//
// Data lives in _data/tax/returns.json in the vault bucket (hidden from the document list):
//   { returns: { [assessmentYear]: TaxReturn }, updatedAt }
//
// The browser reads the ITR JSON from the e-filing portal and sends only the summary (see parseReturn in
// src/lib/tax.ts): Aadhaar, address, phone and bank details never get this far. One return is kept per assessment
// year; uploading the same year again (a revised return) replaces it. Everything coming from the browser is
// re-validated here.

const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')

const RETURNS_KEY = '_data/tax/returns.json'
const MAX_YEARS = 40
const MAX_DEPTH = 5
const MAX_ITEMS = 200

function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

// Copies plain data only: numbers must be finite, strings are trimmed and capped, arrays and depth are bounded.
function clean(value, depth = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.trim().slice(0, 200)
  if (value === null || depth >= MAX_DEPTH) return null
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => clean(v, depth + 1))
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value).slice(0, MAX_ITEMS)) {
      if (/^[A-Za-z0-9_]{1,40}$/.test(k)) out[k] = clean(v, depth + 1)
    }
    return out
  }
  return null
}

const FORMS = ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4']
const REGIMES = ['old', 'new', 'unknown']
const REQUIRED = ['income', 'tax', 'paid']

function sanitizeReturn(raw) {
  if (!raw || typeof raw !== 'object') return null
  const ay = typeof raw.ay === 'string' ? raw.ay.trim() : ''
  if (!/^20\d{2}$/.test(ay)) return null
  if (!REQUIRED.every((k) => raw[k] && typeof raw[k] === 'object')) return null
  const filedOn = isRealDate(raw.filedOn) ? raw.filedOn : ''
  const body = clean(raw)
  return {
    ...body,
    ay,
    form: FORMS.includes(body.form) ? body.form : 'ITR-1',
    filedOn,
    dueDate: isRealDate(raw.dueDate) ? raw.dueDate : null,
    regime: REGIMES.includes(body.regime) ? body.regime : 'unknown',
    source: typeof body.source === 'string' ? body.source.replace(/[^\w.\- ]/g, '') : '',
  }
}

function createTaxApi({ s3, bucket }) {
  async function load() {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: RETURNS_KEY }))
      const data = JSON.parse(await res.Body.transformToString())
      return data && data.returns && typeof data.returns === 'object' ? data.returns : {}
    } catch (err) {
      if (err.name === 'NoSuchKey') return {}
      throw err
    }
  }

  async function store(returns) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: RETURNS_KEY,
        ContentType: 'application/json',
        Body: JSON.stringify({ returns, updatedAt: new Date().toISOString() }),
      }),
    )
    return returns
  }

  const asList = (returns) => Object.values(returns).sort((a, b) => a.ay.localeCompare(b.ay))

  async function list() {
    return { statusCode: 200, body: { returns: asList(await load()) } }
  }

  async function save(payload) {
    const incoming = Array.isArray(payload.returns) ? payload.returns : [payload.return]
    const clean = incoming.map(sanitizeReturn).filter(Boolean)
    if (!clean.length) return { statusCode: 400, body: { error: 'That does not look like an income-tax return.' } }
    const returns = await load()
    for (const r of clean) returns[r.ay] = r
    if (Object.keys(returns).length > MAX_YEARS) return { statusCode: 400, body: { error: `You can keep up to ${MAX_YEARS} years of returns.` } }
    return { statusCode: 200, body: { returns: asList(await store(returns)), saved: clean.map((r) => r.ay) } }
  }

  async function remove(query) {
    const ay = typeof query.ay === 'string' ? query.ay : ''
    const returns = await load()
    if (!returns[ay]) return { statusCode: 404, body: { error: 'That return was not found.' } }
    delete returns[ay]
    return { statusCode: 200, body: { returns: asList(await store(returns)) } }
  }

  // Returns null for paths that aren't tax routes so the caller can carry on.
  return async function handle({ method, path, payload, query }) {
    if (path !== '/admin/tax/returns') return null
    if (method === 'GET') return list()
    if (method === 'POST') return save(payload || {})
    if (method === 'DELETE') return remove(query || {})
    return null
  }
}

module.exports = { createTaxApi, sanitizeReturn }
