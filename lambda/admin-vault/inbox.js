// Statements that arrive by email.
//
// A small Google Apps Script running in my own Gmail (lambda/admin-vault/gmail-forwarder.gs) posts each bank statement PDF
// here. Nothing is read from Gmail by AWS, and the ingest key can only add PDFs to this inbox.
//
//   POST /ingest/statement        (no login; header x-ingest-key)  { filename, from, subject, messageId, receivedAt, pdfBase64 }
//   GET  /admin/inbox                                              items + the labels of the saved PDF passwords
//   POST /admin/inbox/prepare     { id }   unlocks the PDF with a saved password, works out what it is, and hands it to the
//                                          normal statement pipeline. The browser then reads and saves it like an upload
//   POST /admin/inbox/done        { id, statementId }              marks an item finished
//   POST /admin/inbox/skip        { id }                           dismisses an item
//   POST /admin/inbox/passwords   { label, password }  ·  DELETE /admin/inbox/passwords?id=
//
// Files: _data/inbox/index.json, _data/inbox/files/<id>.pdf, _data/inbox/passwords.json (AES-256-GCM, never sent back).

const crypto = require('crypto')
const { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')

const INDEX_KEY = '_data/inbox/index.json'
const PASSWORDS_KEY = '_data/inbox/passwords.json'
const fileKey = (id) => `_data/inbox/files/${id}.pdf`
const MAX_BYTES = 4_000_000
const MAX_ITEMS = 500
const MAX_PASSWORDS = 20

// Statement mail only counts when it comes from one of these domains.
const SENDER_DOMAINS = ['icici.bank.in', 'icicibank.com', 'axis.bank.in', 'axisbank.com']

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

function senderAllowed(from) {
  const m = String(from || '').toLowerCase().match(/[a-z0-9._%+-]+@([a-z0-9.-]+)/)
  return Boolean(m) && SENDER_DOMAINS.some((d) => m[1] === d || m[1].endsWith(`.${d}`))
}

/** A first guess at the kind from the subject and file name, so the right page can offer it. Checked again when it is read. */
function guessKind(subject, filename) {
  const t = `${subject} ${filename}`.toLowerCase()
  if (/credit ?card|card statement|cc statement/.test(t)) return 'card'
  if (/loan|amortiz|amortis|emi schedule/.test(t)) return 'loan'
  return 'bank'
}

/** What a readable PDF actually is, from its text. */
function kindFromLines(lines, detectBank) {
  const head = lines.slice(0, 120).join('\n')
  if (detectBank(lines)) return 'bank'
  // Card statements list EMI "Amortization" rows, so cards are recognised before loans, and loans need a stricter match.
  if (/card account no|credit card statement|card number\s*:/i.test(head)) return 'card'
  if (/loan account statement|loan a\/c|amortization schedule|amortisation schedule|repayment schedule/i.test(head)) return 'loan'
  if (/credit card/i.test(head)) return 'card'
  if (/statement of (transactions in )?(saving|current)|account statement|tran date/i.test(head)) return 'bank'
  return null
}

function createInboxApi({ s3, bucket, ingestKey, secretKey, statementsApi, readPdf, detectBank, now = () => new Date() }) {
  const key = crypto.createHash('sha256').update(`inbox:${secretKey || ''}`).digest()
  const seal = (plain) => {
    const iv = crypto.randomBytes(12)
    const c = crypto.createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
    return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`
  }
  const open = (sealed) => {
    const [iv, tag, enc] = String(sealed).split('.').map((p) => Buffer.from(p, 'base64'))
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
  }

  async function getBytes(k) {
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: k }))
      return { bytes: Buffer.from(await out.Body.transformToByteArray()), etag: out.ETag }
    } catch (err) {
      if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) return { bytes: null, etag: null }
      throw err
    }
  }
  const readJson = async (k) => {
    const { bytes, etag } = await getBytes(k)
    return { data: bytes ? JSON.parse(bytes.toString('utf8')) : null, etag }
  }

  async function update(k, change) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, etag } = await readJson(k)
      const next = change(data)
      try {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: k, Body: JSON.stringify(next), ContentType: 'application/json', ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }) }))
        return next
      } catch (err) {
        const status = err && err.$metadata && err.$metadata.httpStatusCode
        if (status !== 412 && status !== 409 && !(err && err.name === 'PreconditionFailed')) throw err
      }
    }
    throw new Error('Too many concurrent updates.')
  }

  const items = async () => ((await readJson(INDEX_KEY)).data || { items: [] }).items
  const setItem = (id, patch) => update(INDEX_KEY, (d) => ({ items: ((d && d.items) || []).map((i) => (i.id === id ? { ...i, ...patch } : i)) }))

  // ----- Ingest (called by the Apps Script) -----
  async function ingest(headers, payload) {
    const given = String((headers && (headers['x-ingest-key'] || headers['X-Ingest-Key'])) || '')
    const a = Buffer.from(given)
    const b = Buffer.from(String(ingestKey || ''))
    if (!ingestKey || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { statusCode: 401, body: { error: 'Not allowed.' } }

    if (!payload || typeof payload !== 'object') return { statusCode: 400, body: { error: 'Invalid request.' } }
    if (!senderAllowed(payload.from)) return { statusCode: 200, body: { status: 'ignored', reason: 'sender' } }
    let pdf
    try {
      pdf = Buffer.from(String(payload.pdfBase64 || ''), 'base64')
    } catch {
      return { statusCode: 400, body: { error: 'Invalid attachment.' } }
    }
    if (pdf.length < 200 || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') return { statusCode: 200, body: { status: 'ignored', reason: 'not a pdf' } }
    if (pdf.length > MAX_BYTES) return { statusCode: 413, body: { error: 'That PDF is too large.' } }

    const hash = sha(pdf)
    const id = hash.slice(0, 16)
    const filename = text(payload.filename, 120) || 'statement.pdf'
    const subject = text(payload.subject, 200)
    let duplicate = false
    await update(INDEX_KEY, (d) => {
      const list = (d && d.items) || []
      if (list.some((i) => i.hash === hash)) {
        duplicate = true
        return { items: list }
      }
      const item = { id, hash, filename, subject, from: text(payload.from, 120), receivedAt: text(payload.receivedAt, 40) || now().toISOString(), size: pdf.length, guess: guessKind(subject, filename), status: 'new', addedAt: now().toISOString() }
      return { items: [item, ...list].slice(0, MAX_ITEMS) }
    })
    if (duplicate) return { statusCode: 200, body: { status: 'duplicate' } }
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: fileKey(id), Body: pdf, ContentType: 'application/pdf' }))
    return { statusCode: 200, body: { status: 'saved', id } }
  }

  // ----- Admin routes -----
  async function list() {
    const { data } = await readJson(PASSWORDS_KEY)
    return { statusCode: 200, body: { items: await items(), passwords: ((data && data.items) || []).map((p) => ({ id: p.id, label: p.label })), configured: Boolean(ingestKey) } }
  }

  async function addPassword(payload) {
    const label = text(payload && payload.label, 40)
    const password = typeof (payload && payload.password) === 'string' ? payload.password : ''
    if (!label || !password || password.length > 100) return { statusCode: 400, body: { error: 'A label and a password are required.' } }
    const id = crypto.randomBytes(5).toString('hex')
    let full = false
    await update(PASSWORDS_KEY, (d) => {
      const list = (d && d.items) || []
      if (list.length >= MAX_PASSWORDS) {
        full = true
        return { items: list }
      }
      return { items: [...list, { id, label, sealed: seal(password) }] }
    })
    return full ? { statusCode: 400, body: { error: `You can save up to ${MAX_PASSWORDS} passwords.` } } : { statusCode: 200, body: { id } }
  }

  async function removePassword(query) {
    const id = text(query && query.id, 20)
    await update(PASSWORDS_KEY, (d) => ({ items: ((d && d.items) || []).filter((p) => p.id !== id) }))
    return { statusCode: 200, body: { ok: true } }
  }

  async function prepare(payload) {
    const id = text(payload && payload.id, 32)
    const item = (await items()).find((i) => i.id === id)
    if (!item) return { statusCode: 404, body: { error: 'That email attachment was not found.' } }
    const { bytes } = await getBytes(fileKey(id))
    if (!bytes) return { statusCode: 404, body: { error: 'The saved PDF is missing.' } }

    // Try no password, then each saved one, until the PDF opens.
    const { data } = await readJson(PASSWORDS_KEY)
    const tries = ['', ...(((data && data.items) || []).map((p) => {
      try {
        return open(p.sealed)
      } catch {
        return null
      }
    }).filter((p) => p !== null))]
    let opened = null
    let usedPassword = ''
    let lastError = null
    for (const pw of tries) {
      try {
        opened = await readPdf(bytes, pw)
        usedPassword = pw
        break
      } catch (err) {
        lastError = err
        if (!err || !['password_required', 'wrong_password'].includes(err.code)) break
      }
    }
    if (!opened) {
      const wantsPassword = lastError && ['password_required', 'wrong_password'].includes(lastError.code)
      const message = wantsPassword ? 'None of your saved passwords opened this PDF. Add its password below and try again.' : (lastError && lastError.message) || 'This PDF could not be read.'
      await setItem(id, { status: 'failed', error: message })
      return { statusCode: 422, body: { error: message, code: wantsPassword ? 'password_required' : 'unreadable' } }
    }

    const kind = kindFromLines(opened.lines, detectBank)
    if (!kind) {
      await setItem(id, { status: 'skipped', error: 'This does not look like a bank, card or loan statement.' })
      return { statusCode: 422, body: { error: 'This does not look like a bank, card or loan statement.', code: 'not_a_statement' } }
    }

    // Hand the file to the ordinary pipeline exactly as an upload would.
    const statementId = crypto.randomBytes(6).toString('hex')
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `_data/statements/${kind}/${statementId}/original`, Body: bytes, ContentType: 'application/pdf' }))
    const res = await statementsApi({ method: 'POST', path: '/admin/statements/prepare', payload: { kind, id: statementId, password: usedPassword || undefined }, query: {} })
    if (!res || res.statusCode !== 200) {
      const message = (res && res.body && res.body.error) || 'This statement could not be prepared.'
      await setItem(id, { status: 'failed', error: message })
      return { statusCode: (res && res.statusCode) || 500, body: { error: message } }
    }
    await setItem(id, { status: 'ready', kind, statementId, error: '' })
    return { statusCode: 200, body: { ...res.body, kind, statementId, filename: item.filename } }
  }

  const done = async (payload) => {
    const id = text(payload && payload.id, 32)
    await setItem(id, { status: 'done', statementId: text(payload && payload.statementId, 32), doneAt: now().toISOString(), error: '' })
    return { statusCode: 200, body: { ok: true } }
  }
  const skip = async (payload) => {
    await setItem(text(payload && payload.id, 32), { status: 'skipped' })
    return { statusCode: 200, body: { ok: true } }
  }

  async function adminRoute({ method, path, payload, query }) {
    if (method === 'GET' && path === '/admin/inbox') return list()
    if (method === 'POST' && path === '/admin/inbox/prepare') return prepare(payload)
    if (method === 'POST' && path === '/admin/inbox/done') return done(payload)
    if (method === 'POST' && path === '/admin/inbox/skip') return skip(payload)
    if (method === 'POST' && path === '/admin/inbox/passwords') return addPassword(payload)
    if (method === 'DELETE' && path === '/admin/inbox/passwords') return removePassword(query)
    return null
  }

  return { ingest, adminRoute, seal }
}

/** Encrypts a password the same way the API does, for seeding from a script. */
const sealWith = (secretKey, plain) => createInboxApi({ s3: null, bucket: '', secretKey }).seal(plain)

module.exports = { createInboxApi, sealWith, senderAllowed, guessKind, kindFromLines, SENDER_DOMAINS, PASSWORDS_KEY }
