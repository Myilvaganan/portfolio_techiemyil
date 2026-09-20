// Bank / credit-card statement processing for the admin dashboards.
//
// Flow (every step is its own request so each stays under API Gateway's 30 s limit):
//   upload-url -> browser PUTs the file straight to S3
//   prepare    -> unlock the PDF (password used once, never stored), save the unlocked copy, extract text rows
//   extract    -> one AI call per chunk of rows (plus one for the statement header)
//   commit     -> merge the transactions into the per-kind data file
//   insights / ask -> the strongest model, on aggregates only
//
// Data lives under _data/statements/<kind>/ in the vault bucket (hidden from the document list).

const crypto = require('crypto')
const {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

const KINDS = ['bank', 'card']
const DATA_ROOT = '_data/statements'
const MAX_TXNS = 100000
const CHUNK_LINES = 30
const UPLOAD_TTL = 300
const DOWNLOAD_TTL = 120

// Low-cost tier by default: on a 60-row test it read every amount exactly and categorised 60/60 correctly.
const DEFAULT_MODEL = 'gpt-5.4-mini'
const EXTRACT_MODEL = () => process.env.OPENAI_MODEL_EXTRACT || DEFAULT_MODEL
const INSIGHT_MODEL = () => process.env.OPENAI_MODEL_INSIGHTS || DEFAULT_MODEL
const FAST_MODEL = () => process.env.OPENAI_MODEL_FAST || DEFAULT_MODEL

// ---------- Categories ----------

const BANK_CATEGORIES = [
  'Salary', 'Other Income', 'Interest', 'Refund', 'Transfer', 'Rent', 'EMI & Loans', 'Investments', 'Insurance', 'Groceries',
  'Food & Dining', 'Shopping', 'Transport', 'Fuel', 'Travel', 'Bills & Utilities', 'Subscriptions', 'Health', 'Education',
  'Entertainment', 'Cash Withdrawal', 'Fees & Charges', 'Taxes', 'Other',
]
const CARD_CATEGORIES = [
  'Groceries', 'Food & Dining', 'Shopping', 'Transport', 'Fuel', 'Travel', 'Bills & Utilities', 'Subscriptions', 'Health',
  'Education', 'Entertainment', 'Insurance', 'EMI & Loans', 'Fees & Interest', 'Card Payment', 'Cashback & Rewards', 'Refund', 'Other',
]
const BANK_CHANNELS = ['UPI', 'NEFT', 'IMPS', 'RTGS', 'ATM', 'Card', 'Auto-debit', 'Cheque', 'Interest', 'Charges', 'Other']
const CARD_TYPES = ['purchase', 'payment', 'refund', 'fee', 'interest', 'emi', 'cashback', 'other']

// ---------- PDF → text rows ----------

let mupdfPromise
function loadMupdf() {
  mupdfPromise ??= import('mupdf')
  return mupdfPromise
}

function fail(code, message, statusCode = 422) {
  return Object.assign(new Error(message), { code, statusCode })
}

// Rebuild table rows from positioned text: lines sharing a baseline become one row, wide gaps become " | ".
function pageRows(stextJson) {
  const parts = []
  for (const block of stextJson.blocks || []) {
    if (block.type !== 'text') continue
    for (const line of block.lines || []) {
      const text = String(line.text || '').trim()
      if (!text) continue
      const b = line.bbox || {}
      parts.push({ x: b.x ?? 0, w: b.w ?? 0, y: (b.y ?? 0) + (b.h ?? 0) / 2, text })
    }
  }
  parts.sort((a, b) => a.y - b.y || a.x - b.x)
  const rows = []
  for (const p of parts) {
    const last = rows[rows.length - 1]
    if (last && Math.abs(p.y - last.y) <= 3) last.parts.push(p)
    else rows.push({ y: p.y, parts: [p] })
  }
  return rows.map((row) => {
    row.parts.sort((a, b) => a.x - b.x)
    let out = row.parts[0].text
    for (let i = 1; i < row.parts.length; i++) {
      const gap = row.parts[i].x - (row.parts[i - 1].x + row.parts[i - 1].w)
      out += (gap > 6 ? ' | ' : ' ') + row.parts[i].text
    }
    return out
  })
}

// Unlocks (if needed) and returns the decrypted bytes plus text rows for every page.
async function readPdf(bytes, password) {
  const mupdf = await loadMupdf()
  let doc
  try {
    doc = mupdf.Document.openDocument(Buffer.from(bytes), 'application/pdf')
  } catch {
    throw fail('bad_pdf', 'This file could not be read as a PDF.')
  }
  const encrypted = doc.needsPassword()
  if (encrypted) {
    if (!password) throw fail('password_required', 'This PDF is password protected.')
    if (doc.authenticatePassword(password) === 0) throw fail('wrong_password', 'That password did not open the PDF.')
  }
  const pageCount = doc.countPages()
  const lines = []
  for (let i = 0; i < pageCount; i++) {
    const stext = JSON.parse(doc.loadPage(i).toStructuredText('preserve-whitespace').asJSON())
    lines.push(`=== page ${i + 1} ===`, ...pageRows(stext))
  }
  const decrypted = doc.asPDF().saveToBuffer('compress,encrypt=none').asUint8Array()
  return { decrypted: Buffer.from(decrypted), lines, pageCount, encrypted }
}

const ROW_START = /^(?:\d{1,5}\s*\|\s*)?\d{1,2}[/\-. ](?:\d{1,2}|[A-Za-z]{3})[/\-. ]\d{2,4}/

// Cut chunks at row starts so a transaction is not split across two AI calls.
function chunkLines(lines, max = CHUNK_LINES) {
  const chunks = []
  let i = 0
  while (i < lines.length) {
    let end = Math.min(i + max, lines.length)
    if (end < lines.length) {
      const limit = Math.min(end + 8, lines.length)
      let j = end
      while (j < limit && !ROW_START.test(lines[j])) j++
      if (j < limit) end = j
    }
    chunks.push(lines.slice(i, end))
    i = end
  }
  return chunks
}

// Account/card numbers and PAN never need to leave the vault to categorise a transaction.
function maskSensitive(text) {
  return text
    .replace(/\b(\d{4})[ -](\d{4})[ -](\d{4})[ -](\d{4})\b/g, 'XXXX XXXX XXXX $4')
    .replace(/\b\d{9,}\b(?!\.\d)/g, (m) => `XXXX${m.slice(-4)}`)
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, 'XXXXXXXXXX')
}

function headerText(lines) {
  if (lines.length <= 80) return lines.join('\n')
  return [...lines.slice(0, 50), '...', ...lines.slice(-30)].join('\n')
}

// ---------- OpenAI ----------

async function callOpenAI({ model, system, user, name, schema, effort = 'low', timeoutMs = 24000, maxTokens = 9000 }) {
  if (!process.env.OPENAI_API_KEY) throw fail('ai_not_configured', 'AI is not configured yet (OPENAI_API_KEY).', 500)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort },
        max_output_tokens: maxTokens,
        input: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        text: { format: { type: 'json_schema', name, strict: true, schema } },
      }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const message = (body && body.error && body.error.message) || ''
      console.error('openai error', res.status, message)
      if (res.status === 429 && /credit|quota|billing/i.test(message)) {
        throw fail('ai_no_credits', 'OpenAI says the account has no credits left. Add credits at platform.openai.com → Billing, then retry — your statement is already saved, nothing is lost.', 402)
      }
      if (res.status === 429) throw fail('ai_rate_limited', 'The AI is busy right now. Please retry in a moment.', 429)
      if (res.status === 401) throw fail('ai_not_configured', 'The OpenAI API key was rejected. Check OPENAI_API_KEY on the Lambda.', 500)
      throw fail('ai_failed', 'The AI request failed. Please try again.', 502)
    }
    if (body.status === 'incomplete') throw fail('ai_incomplete', 'The AI response was cut off. Please retry.', 502)
    const text = body.output_text ?? (body.output || []).flatMap((o) => o.content || []).map((c) => c.text).filter(Boolean).join('')
    return JSON.parse(text)
  } catch (err) {
    if (err.name === 'AbortError') throw fail('ai_timeout', 'The AI took too long. Please retry.', 504)
    if (err instanceof SyntaxError) throw fail('ai_failed', 'The AI returned an unreadable answer. Please retry.', 502)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

const str = { type: 'string' }
const nstr = { type: ['string', 'null'] }
const num = { type: 'number' }
const nnum = { type: ['number', 'null'] }
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })

const SCHEMAS = {
  bankTxns: obj({
    transactions: {
      type: 'array',
      items: obj({
        date: str,
        description: str,
        merchant: str,
        debit: num,
        credit: num,
        balance: nnum,
        category: { type: 'string', enum: BANK_CATEGORIES },
        channel: { type: 'string', enum: BANK_CHANNELS },
      }),
    },
  }),
  cardTxns: obj({
    transactions: {
      type: 'array',
      items: obj({
        date: str,
        description: str,
        merchant: str,
        debit: num,
        credit: num,
        category: { type: 'string', enum: CARD_CATEGORIES },
        type: { type: 'string', enum: CARD_TYPES },
      }),
    },
  }),
  bankMeta: obj({
    bank: { type: 'string', enum: ['icici', 'axis', 'other'] },
    accountHolder: nstr,
    accountLast4: nstr,
    accountType: nstr,
    periodFrom: nstr,
    periodTo: nstr,
    openingBalance: nnum,
    closingBalance: nnum,
  }),
  cardMeta: obj({
    bank: { type: 'string', enum: ['icici', 'axis', 'other'] },
    cardName: nstr,
    cardLast4: nstr,
    holderName: nstr,
    statementDate: nstr,
    dueDate: nstr,
    periodFrom: nstr,
    periodTo: nstr,
    totalDue: nnum,
    minDue: nnum,
    creditLimit: nnum,
    availableLimit: nnum,
    rewardPoints: nnum,
    previousBalance: nnum,
  }),
  insights: obj({
    headline: str,
    summary: str,
    score: obj({ value: num, label: str }),
    highlights: { type: 'array', items: obj({ title: str, detail: str, tone: { type: 'string', enum: ['good', 'warn', 'bad', 'info'] } }) },
    tips: { type: 'array', items: obj({ title: str, detail: str }) },
    risks: { type: 'array', items: str },
  }),
  answer: obj({ answer: str }),
}

const EXTRACT_RULES = {
  bank: `You extract transactions from an Indian bank account statement (ICICI Bank or Axis Bank). Rows are pipe-separated text rebuilt from a PDF table.
- Output every real transaction row and nothing else: skip headers, column titles, page markers, opening/closing balance lines, totals and legal text.
- Dates must be YYYY-MM-DD (statement dates are day-first, e.g. 02/08/2026 = 2026-08-02).
- debit = money leaving the account (withdrawal / Dr), credit = money coming in (deposit / Cr). Exactly one of them is non-zero. Amounts are plain positive numbers without commas.
- balance = the running balance printed on that row, or null.
- A description that wraps onto the next line belongs to the previous transaction — merge it, do not create a new row.
- merchant = a short clean name (e.g. "Swiggy", "Netflix", "Acme Tech (salary)", "HDFC ATM"); description = the original remarks, trimmed.
- Pick the single best category and channel. Salary credits from an employer are "Salary"; own-account or family transfers are "Transfer".`,
  card: `You extract transactions from an Indian ICICI Bank credit card statement. Rows are pipe-separated text rebuilt from a PDF table.
- Output every real transaction row and nothing else: skip headers, column titles, page markers, summaries, reward-point tables and legal text.
- Dates must be YYYY-MM-DD (day-first in the statement).
- debit = an amount charged to the card (purchases, fees, interest, GST, EMI instalments). credit = an amount reducing the balance (payments, refunds, cashback, reversals; rows marked CR). Exactly one is non-zero, plain positive numbers.
- type: purchase, payment, refund, fee, interest, emi, cashback or other. GST on interest/fees is a fee. Reward/cashback credits are "cashback".
- merchant = a short clean name (e.g. "Amazon", "Swiggy", "Netflix"); description = the original text, trimmed.
- category: the best fit; payments are "Card Payment", interest/fees/GST are "Fees & Interest".`,
}

const META_RULES = {
  bank: 'Read the header/summary of this Indian bank account statement. Dates are YYYY-MM-DD (day-first in the statement). Identify the bank (icici, axis or other). accountLast4 = last four digits of the account number only. Use null for anything not present.',
  card: 'Read the header/summary of this Indian credit card statement. Dates are YYYY-MM-DD (day-first in the statement). Identify the bank (icici, axis or other). cardLast4 = last four digits of the card number only; cardName = the card product name (e.g. "Amazon Pay ICICI Bank Credit Card"). Amounts are plain numbers without commas. Use null for anything not present.',
}

// ---------- Normalising AI output ----------

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
const amount = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0)
const clean = (s, max = 160) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function normalizeTxns(kind, raw) {
  const cats = kind === 'bank' ? BANK_CATEGORIES : CARD_CATEGORIES
  const out = []
  for (const t of raw || []) {
    if (!t || !isDate(t.date)) continue
    const debit = amount(t.debit)
    const credit = amount(t.credit)
    if (!debit && !credit) continue
    const row = {
      date: t.date,
      description: clean(t.description, 200),
      merchant: clean(t.merchant, 60) || clean(t.description, 60),
      debit,
      credit,
      category: cats.includes(t.category) ? t.category : 'Other',
    }
    if (kind === 'bank') {
      row.balance = typeof t.balance === 'number' && Number.isFinite(t.balance) ? t.balance : null
      row.channel = BANK_CHANNELS.includes(t.channel) ? t.channel : 'Other'
    } else {
      row.type = CARD_TYPES.includes(t.type) ? t.type : 'other'
    }
    out.push(row)
  }
  return out
}

function normalizeMeta(kind, raw) {
  const m = raw || {}
  const s = (v, max = 80) => (v === null || v === undefined || v === '' ? null : clean(v, max))
  const d = (v) => (isDate(v) ? v : null)
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const l4 = (v) => (typeof v === 'string' && /(\d{4})\s*$/.test(v) ? v.replace(/\D/g, '').slice(-4) : null)
  const base = { bank: ['icici', 'axis', 'other'].includes(m.bank) ? m.bank : 'other', periodFrom: d(m.periodFrom), periodTo: d(m.periodTo) }
  return kind === 'bank'
    ? { ...base, accountHolder: s(m.accountHolder), accountLast4: l4(m.accountLast4), accountType: s(m.accountType, 40), openingBalance: n(m.openingBalance), closingBalance: n(m.closingBalance) }
    : {
        ...base,
        cardName: s(m.cardName, 60),
        cardLast4: l4(m.cardLast4),
        holderName: s(m.holderName),
        statementDate: d(m.statementDate),
        dueDate: d(m.dueDate),
        totalDue: n(m.totalDue),
        minDue: n(m.minDue),
        creditLimit: n(m.creditLimit),
        availableLimit: n(m.availableLimit),
        rewardPoints: n(m.rewardPoints),
        previousBalance: n(m.previousBalance),
      }
}

// ---------- Storage ----------

function makeStore(s3, bucket) {
  const key = (kind, ...rest) => [DATA_ROOT, kind, ...rest].join('/')
  return {
    key,
    async getBytes(k) {
      try {
        const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: k }))
        return Buffer.from(await out.Body.transformToByteArray())
      } catch (err) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null
        throw err
      }
    },
    async getJson(k, fallback) {
      const bytes = await this.getBytes(k)
      return bytes ? JSON.parse(bytes.toString('utf8')) : fallback
    },
    async putJson(k, value) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: k, ContentType: 'application/json', Body: JSON.stringify(value) }))
    },
    async putBytes(k, bytes, contentType) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: k, ContentType: contentType, Body: bytes }))
    },
    async del(k) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: k }))
    },
    async delPrefix(prefix) {
      const out = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }))
      for (const obj of out.Contents || []) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }))
    },
  }
}

const emptyData = () => ({ statements: [], transactions: [], insights: null })

const validKind = (k) => (KINDS.includes(k) ? k : null)
const validId = (id) => (typeof id === 'string' && /^[a-z0-9]{6,24}$/.test(id) ? id : null)
const bad = (message, statusCode = 400) => ({ statusCode, body: { error: message } })

function accountKey(kind, meta) {
  return `${meta.bank}:${kind === 'bank' ? meta.accountLast4 || '' : meta.cardLast4 || ''}`
}

const txnSignature = (accKey, t) =>
  [accKey, t.date, t.debit, t.credit, t.balance ?? '', t.description.slice(0, 40)].join('|')

// ---------- Handlers ----------

function createStatementsApi({ s3, bucket, sign = getSignedUrl }) {
  const store = makeStore(s3, bucket)

  async function uploadUrl(payload) {
    const kind = validKind(payload.kind)
    if (!kind) return bad('A valid statement type is required.')
    const id = crypto.randomBytes(6).toString('hex')
    const contentType = typeof payload.contentType === 'string' && payload.contentType ? payload.contentType : 'application/octet-stream'
    const uploadUrl = await sign(s3, new PutObjectCommand({ Bucket: bucket, Key: store.key(kind, id, 'original'), ContentType: contentType }), { expiresIn: UPLOAD_TTL })
    return { statusCode: 200, body: { id, uploadUrl, contentType } }
  }

  async function prepare(payload) {
    const kind = validKind(payload.kind)
    const id = validId(payload.id)
    if (!kind || !id) return bad('A valid statement id is required.')
    const original = await store.getBytes(store.key(kind, id, 'original'))
    if (!original) return bad('That upload was not found. Please upload the file again.', 404)

    const isPdf = original.subarray(0, 5).toString('latin1') === '%PDF-'
    let lines
    let pages = 1
    let fileKey
    let encrypted = false
    if (isPdf) {
      const password = typeof payload.password === 'string' ? payload.password : ''
      const pdf = await readPdf(original, password)
      lines = pdf.lines
      pages = pdf.pageCount
      encrypted = pdf.encrypted
      fileKey = store.key(kind, id, 'statement.pdf')
      await store.putBytes(fileKey, pdf.decrypted, 'application/pdf')
    } else {
      const text = original.toString('utf8').replace(/^﻿/, '')
      lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/\s*,\s*/g, ' | '))
      fileKey = store.key(kind, id, 'statement.csv')
      await store.putBytes(fileKey, original, 'text/csv')
    }
    if (lines.filter((l) => /\d/.test(l)).length < 3) {
      await store.delPrefix(store.key(kind, id) + '/')
      return bad('No readable text was found — scanned (image-only) statements are not supported.')
    }
    await store.putJson(store.key(kind, id, 'text.json'), { lines, pages, fileKey })
    await store.del(store.key(kind, id, 'original'))
    return { statusCode: 200, body: { id, pages, encrypted, chunks: chunkLines(lines).length, fileKey } }
  }

  async function extract(payload) {
    const kind = validKind(payload.kind)
    const id = validId(payload.id)
    if (!kind || !id) return bad('A valid statement id is required.')
    const text = await store.getJson(store.key(kind, id, 'text.json'), null)
    if (!text) return bad('That statement was not found. Please upload it again.', 404)

    if (payload.chunk === 'meta') {
      const raw = await callOpenAI({
        model: EXTRACT_MODEL(),
        system: META_RULES[kind],
        user: maskSensitive(headerText(text.lines)),
        name: 'statement_meta',
        schema: kind === 'bank' ? SCHEMAS.bankMeta : SCHEMAS.cardMeta,
        maxTokens: 1500,
      })
      return { statusCode: 200, body: { meta: normalizeMeta(kind, raw) } }
    }

    const chunks = chunkLines(text.lines)
    const idx = Number(payload.chunk)
    if (!Number.isInteger(idx) || idx < 0 || idx >= chunks.length) return bad('That chunk does not exist.')
    const raw = await callOpenAI({
      model: EXTRACT_MODEL(),
      system: EXTRACT_RULES[kind],
      user: maskSensitive(chunks[idx].join('\n')),
      name: 'transactions',
      schema: kind === 'bank' ? SCHEMAS.bankTxns : SCHEMAS.cardTxns,
    })
    return { statusCode: 200, body: { transactions: normalizeTxns(kind, raw.transactions) } }
  }

  async function commit(payload) {
    const kind = validKind(payload.kind)
    const id = validId(payload.id)
    if (!kind || !id) return bad('A valid statement id is required.')
    if (!Array.isArray(payload.transactions) || payload.transactions.length > 20000) return bad('A list of transactions is required.')
    const text = await store.getJson(store.key(kind, id, 'text.json'), null)
    if (!text) return bad('That statement was not found. Please upload it again.', 404)

    const meta = normalizeMeta(kind, payload.meta)
    const incoming = normalizeTxns(kind, payload.transactions)
    if (!incoming.length) return bad('No transactions could be read from this statement.')

    const data = await store.getJson(store.key(kind, 'data.json'), emptyData())
    const accKey = accountKey(kind, meta)

    // Re-uploading the same statement period replaces it instead of doubling the numbers.
    const same = data.statements.filter((s) => s.id !== id && s.accountKey === accKey && meta.periodFrom && s.periodFrom === meta.periodFrom && s.periodTo === meta.periodTo)
    for (const old of same) {
      data.statements = data.statements.filter((s) => s.id !== old.id)
      data.transactions = data.transactions.filter((t) => t.statementId !== old.id)
      await store.delPrefix(store.key(kind, old.id) + '/')
    }

    const seen = new Set(data.transactions.filter((t) => t.accountKey === accKey).map((t) => txnSignature(accKey, t)))
    const added = []
    incoming.forEach((t, i) => {
      const sig = txnSignature(accKey, t)
      if (seen.has(sig)) return
      seen.add(sig)
      added.push({ ...t, id: `${id}-${i}`, statementId: id, accountKey: accKey })
    })
    if (data.transactions.length + added.length > MAX_TXNS) return bad('Too many transactions are stored already.', 413)

    const statement = {
      id,
      kind,
      filename: clean(payload.filename, 120) || 'statement',
      uploadedAt: new Date().toISOString(),
      pages: text.pages,
      fileKey: text.fileKey,
      accountKey: accKey,
      txnCount: added.length,
      duplicatesSkipped: incoming.length - added.length,
      ...meta,
    }
    data.statements.push(statement)
    data.transactions.push(...added)
    data.transactions.sort((a, b) => a.date.localeCompare(b.date))
    data.insights = null
    data.updatedAt = new Date().toISOString()
    await store.putJson(store.key(kind, 'data.json'), data)
    return { statusCode: 200, body: { statement, replaced: same.length } }
  }

  async function getData(query) {
    const kind = validKind(query.kind)
    if (!kind) return bad('A valid statement type is required.')
    const data = await store.getJson(store.key(kind, 'data.json'), emptyData())
    return { statusCode: 200, body: data }
  }

  async function remove(query) {
    const kind = validKind(query.kind)
    const id = validId(query.id)
    if (!kind || !id) return bad('A valid statement id is required.')
    const data = await store.getJson(store.key(kind, 'data.json'), emptyData())
    data.statements = data.statements.filter((s) => s.id !== id)
    data.transactions = data.transactions.filter((t) => t.statementId !== id)
    data.insights = null
    data.updatedAt = new Date().toISOString()
    await store.putJson(store.key(kind, 'data.json'), data)
    await store.delPrefix(store.key(kind, id) + '/')
    return { statusCode: 200, body: { ok: true } }
  }

  async function fileUrl(query) {
    const kind = validKind(query.kind)
    const id = validId(query.id)
    if (!kind || !id) return bad('A valid statement id is required.')
    const data = await store.getJson(store.key(kind, 'data.json'), emptyData())
    const st = data.statements.find((s) => s.id === id)
    if (!st) return bad('Statement not found.', 404)
    const filename = st.filename.replace(/[^\w.\- ]/g, '_')
    const url = await sign(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: st.fileKey, ResponseContentDisposition: `attachment; filename="unlocked-${filename}"` }),
      { expiresIn: DOWNLOAD_TTL },
    )
    return { statusCode: 200, body: { url } }
  }

  const INSIGHT_SYSTEM = {
    bank: `You are a sharp, friendly personal-finance analyst for an Indian user. You receive aggregated numbers from their bank account statements (ICICI/Axis) in INR.
Rules: use ONLY numbers present in the data — never invent or estimate figures; quote amounts as ₹ with Indian grouping; be specific (name merchants, months, categories); no generic advice; no disclaimers. Do not mention that data is "aggregated".
score.value is a 0-100 financial-health score (savings rate, spending stability, cash buffer, recurring burden) with a 2-4 word label. Give 4-6 highlights (mix of good/warn/bad/info), 3-5 concrete tips with estimated monthly impact where the data supports it, and 0-3 risks.`,
    card: `You are a sharp, friendly credit-card analyst for an Indian user. You receive aggregated numbers from their ICICI credit card statements (several cards) in INR.
Rules: use ONLY numbers present in the data — never invent or estimate figures; quote amounts as ₹ with Indian grouping; be specific (name cards by last four digits/name, merchants, months); no generic advice; no disclaimers. Do not mention that data is "aggregated".
score.value is a 0-100 card-health score (utilisation, interest/fees paid, on-time payment, spend concentration) with a 2-4 word label. Give 4-6 highlights (mix of good/warn/bad/info), 3-5 concrete tips (which card to use for which category, fees to avoid, dues to clear) and 0-3 risks.`,
  }

  async function insights(payload) {
    const kind = validKind(payload.kind)
    if (!kind) return bad('A valid statement type is required.')
    if (!payload.context || typeof payload.context !== 'object') return bad('Nothing to analyse yet.')
    const context = JSON.stringify(payload.context)
    if (context.length > 60000) return bad('That is too much data to analyse at once.', 413)
    const model = payload.fast ? FAST_MODEL() : INSIGHT_MODEL()
    const result = await callOpenAI({
      model,
      system: INSIGHT_SYSTEM[kind],
      user: context,
      name: 'insights',
      schema: SCHEMAS.insights,
      timeoutMs: 25000,
      maxTokens: 4000,
    })
    result.score.value = Math.max(0, Math.min(100, Math.round(result.score.value)))
    const saved = { fingerprint: typeof payload.fingerprint === 'string' ? payload.fingerprint.slice(0, 64) : '', generatedAt: new Date().toISOString(), model, ...result }
    const data = await store.getJson(store.key(kind, 'data.json'), null)
    if (data) {
      data.insights = saved
      await store.putJson(store.key(kind, 'data.json'), data)
    }
    return { statusCode: 200, body: saved }
  }

  async function ask(payload) {
    const kind = validKind(payload.kind)
    if (!kind) return bad('A valid statement type is required.')
    const question = clean(payload.question, 400)
    if (!question) return bad('Ask a question first.')
    const context = JSON.stringify(payload.context || {})
    if (context.length > 60000) return bad('That is too much data to analyse at once.', 413)
    const result = await callOpenAI({
      model: payload.fast ? FAST_MODEL() : INSIGHT_MODEL(),
      system: `You answer questions about an Indian user's ${kind === 'bank' ? 'bank account' : 'credit card'} statements using ONLY the JSON data provided (INR, amounts as ₹ with Indian grouping). If the data cannot answer, say so plainly and say what would be needed. Be concise: 2-5 sentences, or a short list. Never invent numbers.`,
      user: `Data:\n${context}\n\nQuestion: ${question}`,
      name: 'answer',
      schema: SCHEMAS.answer,
      timeoutMs: 25000,
      maxTokens: 1500,
    })
    return { statusCode: 200, body: { answer: result.answer } }
  }

  // Returns null when the path is not a statements route.
  return async function handle({ method, path, payload, query }) {
    try {
      if (method === 'POST' && path === '/admin/statements/upload-url') return await uploadUrl(payload)
      if (method === 'POST' && path === '/admin/statements/prepare') return await prepare(payload)
      if (method === 'POST' && path === '/admin/statements/extract') return await extract(payload)
      if (method === 'POST' && path === '/admin/statements/commit') return await commit(payload)
      if (method === 'GET' && path === '/admin/statements/data') return await getData(query)
      if (method === 'DELETE' && path === '/admin/statements') return await remove(query)
      if (method === 'GET' && path === '/admin/statements/file-url') return await fileUrl(query)
      if (method === 'POST' && path === '/admin/statements/insights') return await insights(payload)
      if (method === 'POST' && path === '/admin/statements/ask') return await ask(payload)
      return null
    } catch (err) {
      if (err.code && err.statusCode) return { statusCode: err.statusCode, body: { error: err.message, code: err.code } }
      throw err
    }
  }
}

module.exports = {
  createStatementsApi,
  // exported for tests
  pageRows,
  chunkLines,
  maskSensitive,
  normalizeTxns,
  normalizeMeta,
  readPdf,
}
