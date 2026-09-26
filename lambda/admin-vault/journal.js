// Trading journal storage for the admin dashboard.
//
// Data lives under _data/journal/ in the vault bucket (hidden from the document list):
//   <YYYY-MM>.json  { trades: Trade[], days: { [YYYY-MM-DD]: DayNote }, updatedAt }
//   settings.json   { taxRate, taxMode, taxRules[], startingCapital, dailyLossLimit, maxTradesPerDay }
//   mt5-accounts.json  { accounts: { [accountNumber]: Mt5Account } }   MetaTrader 5 account details
//   mt5-reports/<account>/<stamp>.html   the original uploaded report, kept for reference
//
// Trades and day notes carry an `account` ('' = the main options journal, otherwise an MT5 account number) so each
// account is its own calendar. A day note for an account is stored under "<date>#<account>".
//
// One file per month keeps the calendar view a single small read, while the dashboard reads
// only the months in its range. Everything coming from the browser is re-validated here.
// Writes use POST / DELETE-with-query because the entry-point router only parses POST bodies.

const crypto = require('crypto')
const { GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3')

const ROOT = '_data/journal'
const SETTINGS_KEY = `${ROOT}/settings.json`
const MT5_ACCOUNTS_KEY = `${ROOT}/mt5-accounts.json`
const MAX_TRADES_PER_MONTH = 3000
const MAX_MONTHS = 240
const MAX_IMPORT_PER_REQUEST = 2000
const MAX_MT5_ACCOUNTS = 20
const MAX_MT5_BALANCE_OPS = 1000
const MAX_MT5_REPORT_CHARS = 3_000_000

const DIRECTIONS = ['BUY', 'SELL']
const CURRENCIES = ['INR', 'USD']
const BIASES = ['', 'Bullish', 'Bearish', 'Neutral', 'Choppy']
const TAX_MODES = ['per-trade', 'net']

// ---------- Validation helpers ----------

function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

const isMonth = (value) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function num(value, { min = -1e12, max = 1e12, fallback = 0, decimals = 6 } = {}) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) return fallback
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

// null when the field is left blank, so "no stop loss" is not stored as a stop at price 0.
function optionalNum(value, opts) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? num(n, { ...opts, fallback: null }) : null
}

// Account ids end up inside storage keys and day keys ("<date>#<account>"), so keep them to a safe alphabet.
function cleanAccount(value) {
  return typeof value === 'string' ? value.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40) : ''
}

function sanitizeTrade(t) {
  if (!t || typeof t !== 'object') return null
  if (!isRealDate(t.date)) return null
  const instrument = text(t.instrument, 40)
  if (!instrument) return null
  if (!DIRECTIONS.includes(t.direction)) return null
  const grossPnl = Number(t.grossPnl)
  if (!Number.isFinite(grossPnl) || Math.abs(grossPnl) > 1e10) return null

  const currency = CURRENCIES.includes(t.currency) ? t.currency : 'INR'
  const id = typeof t.id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(t.id) ? t.id : crypto.randomUUID()
  const now = new Date().toISOString()

  return {
    id,
    date: t.date,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(t.time) ? t.time : '',
    instrument,
    symbol: text(t.symbol, 60),
    direction: t.direction,
    currency,
    // Only USD trades convert; INR trades are always 1 so a stray rate can't skew totals.
    fxRate: currency === 'USD' ? num(t.fxRate, { min: 1, max: 1000, fallback: 1, decimals: 4 }) : 1,
    qty: num(t.qty, { min: 0, max: 1e9 }),
    contractSize: num(t.contractSize, { min: 0, max: 1e9, fallback: 1 }) || 1,
    entry: optionalNum(t.entry, { min: 0, max: 1e10 }),
    exit: optionalNum(t.exit, { min: 0, max: 1e10 }),
    stopLoss: optionalNum(t.stopLoss, { min: 0, max: 1e10 }),
    target: optionalNum(t.target, { min: 0, max: 1e10 }),
    manualPnl: t.manualPnl === true,
    grossPnl: num(grossPnl, { min: -1e10, max: 1e10, decimals: 2 }),
    fees: num(t.fees, { min: 0, max: 1e9, decimals: 2 }),
    strategy: text(t.strategy, 40),
    emotion: text(t.emotion, 30),
    mistakes: Array.isArray(t.mistakes)
      ? [...new Set(t.mistakes.map((m) => text(m, 40)).filter(Boolean))].slice(0, 12)
      : [],
    followedPlan: t.followedPlan === true ? true : t.followedPlan === false ? false : null,
    rating: Math.round(num(t.rating, { min: 0, max: 5 })),
    notes: text(t.notes, 3000),
    account: cleanAccount(t.account),
    // Where a trade came from (e.g. "options-analytics:zerodha"); empty for trades typed in by hand.
    source: text(t.source, 40),
    createdAt: typeof t.createdAt === 'string' ? t.createdAt.slice(0, 30) : now,
    updatedAt: now,
  }
}

function sanitizeDay(d) {
  if (!d || typeof d !== 'object' || !isRealDate(d.date)) return null
  return {
    date: d.date,
    account: cleanAccount(d.account),
    bias: BIASES.includes(d.bias) ? d.bias : '',
    plan: text(d.plan, 3000),
    review: text(d.review, 3000),
    lessons: text(d.lessons, 2000),
    mood: Math.round(num(d.mood, { min: 0, max: 5 })),
    discipline: Math.round(num(d.discipline, { min: 0, max: 5 })),
  }
}

const isEmptyDay = (d) => !d.bias && !d.plan && !d.review && !d.lessons && !d.mood && !d.discipline

const dayKey = (d) => (d.account ? `${d.date}#${d.account}` : d.date)

// ---------- MetaTrader 5 accounts ----------

const isMt5Time = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v)

// null (not 0) for a missing figure, so "no equity in this report" is never shown as $0.
function moneyOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && Math.abs(n) <= 1e12 ? Math.round(n * 100) / 100 : null
}

function sanitizeMt5Account(a) {
  if (!a || typeof a !== 'object') return null
  const account = cleanAccount(a.account)
  if (!account) return null

  const balanceOps = (Array.isArray(a.balanceOps) ? a.balanceOps : [])
    .filter((o) => o && typeof o === 'object' && isMt5Time(o.time))
    .slice(0, MAX_MT5_BALANCE_OPS)
    .map((o) => ({
      time: o.time,
      type: text(o.type, 20),
      amount: moneyOrNull(o.amount) ?? 0,
      comment: text(o.comment, 120),
      balance: moneyOrNull(o.balance),
    }))

  const summary = {}
  if (a.summary && typeof a.summary === 'object') {
    for (const [k, v] of Object.entries(a.summary).slice(0, 60)) {
      const key = text(k, 60)
      if (key && typeof v === 'string') summary[key] = text(v, 80)
    }
  }

  const rep = a.report && typeof a.report === 'object' ? a.report : {}
  return {
    account,
    name: text(a.name, 80),
    currency: text(a.currency, 10),
    server: text(a.server, 60),
    accountType: text(a.accountType, 20),
    marginMode: text(a.marginMode, 20),
    company: text(a.company, 100),
    balance: moneyOrNull(a.balance),
    credit: moneyOrNull(a.credit),
    floating: moneyOrNull(a.floating),
    equity: moneyOrNull(a.equity),
    margin: moneyOrNull(a.margin),
    freeMargin: moneyOrNull(a.freeMargin),
    marginLevel: moneyOrNull(a.marginLevel),
    balanceOps,
    summary,
    // What the uploaded report covered: when it was generated, the trade date span, and how many trades it held.
    report: {
      time: isMt5Time(rep.time) ? rep.time : '',
      from: isRealDate(rep.from) ? rep.from : '',
      to: isRealDate(rep.to) ? rep.to : '',
      trades: Math.round(num(rep.trades, { min: 0, max: 1e6 })),
    },
    updatedAt: new Date().toISOString(),
  }
}

const MAX_TAX_RULES = 30
// Only Bitcoin is taxed by default; Options Analytics already accounts for its own tax and charges.
const DEFAULT_TAX_RULES = [{ instrument: 'Bitcoin', rate: 30, mode: 'per-trade' }]
const DEFAULT_SETTINGS = { taxRate: 0, taxMode: 'per-trade', taxRules: DEFAULT_TAX_RULES, startingCapital: 0, dailyLossLimit: 0, maxTradesPerDay: 0 }

// One rule per instrument (matched case-insensitively); rules with no name or a bad rate are dropped.
function sanitizeTaxRules(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const rules = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const instrument = text(item.instrument, 40)
    const rate = Number(item.rate)
    if (!instrument || !Number.isFinite(rate) || rate < 0 || rate > 100) continue
    const key = instrument.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    rules.push({ instrument, rate: num(rate, { min: 0, max: 100, decimals: 2 }), mode: TAX_MODES.includes(item.mode) ? item.mode : 'per-trade' })
    if (rules.length >= MAX_TAX_RULES) break
  }
  return rules
}

function sanitizeSettings(s) {
  const r = s && typeof s === 'object' ? s : {}
  return {
    taxRate: num(r.taxRate, { min: 0, max: 100, fallback: DEFAULT_SETTINGS.taxRate, decimals: 2 }),
    taxMode: TAX_MODES.includes(r.taxMode) ? r.taxMode : DEFAULT_SETTINGS.taxMode,
    // Never saved → the defaults; an explicit list (even an empty one) is the user's choice and is kept as sent.
    taxRules: Array.isArray(r.taxRules) ? sanitizeTaxRules(r.taxRules) : DEFAULT_TAX_RULES.map((x) => ({ ...x })),
    startingCapital: num(r.startingCapital, { min: 0, max: 1e12, decimals: 2 }),
    dailyLossLimit: num(r.dailyLossLimit, { min: 0, max: 1e12, decimals: 2 }),
    maxTradesPerDay: Math.round(num(r.maxTradesPerDay, { min: 0, max: 1000 })),
  }
}

// ---------- Storage ----------

const monthKey = (month) => `${ROOT}/${month}.json`

function createJournalApi({ s3, bucket }) {
  async function readJson(key) {
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      return JSON.parse(await out.Body.transformToString())
    } catch (err) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null
      throw err
    }
  }

  const writeJson = (key, value) =>
    s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: 'application/json',
        Body: JSON.stringify({ ...value, updatedAt: new Date().toISOString() }),
      }),
    )

  async function readMonth(month) {
    const doc = await readJson(monthKey(month))
    return {
      trades: Array.isArray(doc?.trades) ? doc.trades : [],
      days: doc?.days && typeof doc.days === 'object' ? doc.days : {},
    }
  }

  async function listMonths() {
    const months = []
    let token
    do {
      const out = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${ROOT}/`, ContinuationToken: token }))
      for (const obj of out.Contents || []) {
        const m = /^_data\/journal\/(\d{4}-\d{2})\.json$/.exec(obj.Key || '')
        if (m && (obj.Size ?? 1) > 0) months.push(m[1])
      }
      token = out.IsTruncated ? out.NextContinuationToken : undefined
    } while (token)
    return months.sort()
  }

  // ----- handlers -----

  async function getData(query) {
    const from = query.from || '0000-00'
    const to = query.to || '9999-99'
    if ((query.from && !isMonth(query.from)) || (query.to && !isMonth(query.to))) {
      return { statusCode: 400, body: { error: 'from and to must be YYYY-MM months.' } }
    }
    const all = await listMonths()
    const wanted = all.filter((m) => m >= from && m <= to).slice(-MAX_MONTHS)
    const docs = await Promise.all(wanted.map(readMonth))
    const trades = docs.flatMap((d) => d.trades)
    trades.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.id.localeCompare(b.id))
    const days = Object.assign({}, ...docs.map((d) => d.days))
    return { statusCode: 200, body: { trades, days, months: all } }
  }

  async function saveTrade(payload) {
    const trade = sanitizeTrade(payload.trade)
    if (!trade) {
      return { statusCode: 400, body: { error: 'A trade needs a valid date, instrument, direction and P&L.' } }
    }
    const month = trade.date.slice(0, 7)
    const doc = await readMonth(month)
    const at = doc.trades.findIndex((t) => t.id === trade.id)
    if (at >= 0) {
      trade.createdAt = doc.trades[at].createdAt || trade.createdAt
      doc.trades[at] = trade
    } else {
      if (doc.trades.length >= MAX_TRADES_PER_MONTH) {
        return { statusCode: 413, body: { error: 'This month has too many trades to store.' } }
      }
      doc.trades.push(trade)
    }

    // The trade's date was edited into another month: remove it from the old file.
    const previous = isRealDate(payload.previousDate) ? payload.previousDate.slice(0, 7) : null
    if (previous && previous !== month) {
      const old = await readMonth(previous)
      const kept = old.trades.filter((t) => t.id !== trade.id)
      if (kept.length !== old.trades.length) await writeJson(monthKey(previous), { trades: kept, days: old.days })
    }

    await writeJson(monthKey(month), doc)
    return { statusCode: 200, body: { trade } }
  }

  // Backfill from another module. Never overwrites: a trade whose id is already stored is skipped, so re-running an
  // import is safe and any edits made to earlier imports (strategy, notes, …) are kept. One read/write per month.
  async function importTrades(payload) {
    if (!Array.isArray(payload.trades)) return { statusCode: 400, body: { error: 'A list of trades is required.' } }
    if (payload.trades.length > MAX_IMPORT_PER_REQUEST) {
      return { statusCode: 413, body: { error: `Send at most ${MAX_IMPORT_PER_REQUEST} trades per request.` } }
    }

    const byMonth = new Map()
    let invalid = 0
    for (const raw of payload.trades) {
      // Imports must carry their own stable id — a generated one would defeat the duplicate check.
      const trade = raw && typeof raw.id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(raw.id) ? sanitizeTrade(raw) : null
      if (!trade) {
        invalid++
        continue
      }
      const month = trade.date.slice(0, 7)
      const list = byMonth.get(month)
      if (list) list.push(trade)
      else byMonth.set(month, [trade])
    }

    let added = 0
    let skipped = 0
    let rejected = 0
    for (const [month, incoming] of byMonth) {
      const doc = await readMonth(month)
      const have = new Set(doc.trades.map((t) => t.id))
      let changed = false
      for (const trade of incoming) {
        if (have.has(trade.id)) {
          skipped++
        } else if (doc.trades.length >= MAX_TRADES_PER_MONTH) {
          rejected++
        } else {
          have.add(trade.id)
          doc.trades.push(trade)
          added++
          changed = true
        }
      }
      if (changed) await writeJson(monthKey(month), doc)
    }
    return { statusCode: 200, body: { added, skipped, invalid, rejected } }
  }

  async function deleteTrade(query) {
    if (!isRealDate(query.date) || typeof query.id !== 'string' || !query.id) {
      return { statusCode: 400, body: { error: 'A trade date and id are required.' } }
    }
    const month = query.date.slice(0, 7)
    const doc = await readMonth(month)
    const kept = doc.trades.filter((t) => t.id !== query.id)
    if (kept.length !== doc.trades.length) await writeJson(monthKey(month), { trades: kept, days: doc.days })
    return { statusCode: 200, body: { ok: true, removed: doc.trades.length - kept.length } }
  }

  async function saveDay(payload) {
    const day = sanitizeDay(payload.day)
    if (!day) return { statusCode: 400, body: { error: 'A valid date is required.' } }
    const month = day.date.slice(0, 7)
    const doc = await readMonth(month)
    if (isEmptyDay(day)) delete doc.days[dayKey(day)]
    else doc.days[dayKey(day)] = day
    await writeJson(monthKey(month), doc)
    return { statusCode: 200, body: { day: isEmptyDay(day) ? null : day } }
  }

  async function getAccounts() {
    const stored = await readJson(MT5_ACCOUNTS_KEY)
    const accounts = stored?.accounts && typeof stored.accounts === 'object' ? Object.values(stored.accounts) : []
    accounts.sort((a, b) => String(a.account).localeCompare(String(b.account)))
    return { statusCode: 200, body: { accounts } }
  }

  // Saves the account details from an uploaded MT5 report (and the report file itself). Uploading again — say a
  // newer report — updates the account: deposits are merged so history is never lost, and an *older* report can't
  // overwrite the balance/equity from a newer one.
  async function saveAccount(payload) {
    const incoming = sanitizeMt5Account(payload.account)
    if (!incoming) return { statusCode: 400, body: { error: 'An MT5 account number is required.' } }
    // Checked before anything is written, so a rejected upload leaves nothing half-saved.
    if (typeof payload.html === 'string' && payload.html.length > MAX_MT5_REPORT_CHARS) {
      return { statusCode: 413, body: { error: 'That report file is too large to store.' } }
    }

    const stored = await readJson(MT5_ACCOUNTS_KEY)
    const accounts = stored?.accounts && typeof stored.accounts === 'object' ? { ...stored.accounts } : {}
    if (!accounts[incoming.account] && Object.keys(accounts).length >= MAX_MT5_ACCOUNTS) {
      return { statusCode: 413, body: { error: 'Too many MT5 accounts are stored.' } }
    }

    const prev = accounts[incoming.account]
    const opKey = (o) => `${o.time}|${o.type}|${o.amount}|${o.comment}`
    const ops = new Map((prev?.balanceOps ?? []).map((o) => [opKey(o), o]))
    for (const o of incoming.balanceOps) ops.set(opKey(o), o)
    const balanceOps = [...ops.values()].sort((a, b) => a.time.localeCompare(b.time)).slice(-MAX_MT5_BALANCE_OPS)

    const isNewer = !prev || incoming.report.time >= (prev.report?.time || '')
    accounts[incoming.account] = isNewer ? { ...incoming, balanceOps } : { ...prev, balanceOps }
    await writeJson(MT5_ACCOUNTS_KEY, { accounts })

    // Keep the original file too, exactly as uploaded (already decoded to text by the browser).
    let savedReport = false
    if (typeof payload.html === 'string' && payload.html.length > 0) {
      const stamp = (incoming.report.time || new Date().toISOString()).replace(/\D/g, '').slice(0, 14) || 'report'
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `${ROOT}/mt5-reports/${incoming.account}/${stamp}.html`,
          ContentType: 'text/html; charset=utf-8',
          Body: payload.html,
        }),
      )
      savedReport = true
    }

    return { statusCode: 200, body: { account: accounts[incoming.account], savedReport } }
  }

  async function getSettings() {
    const stored = await readJson(SETTINGS_KEY)
    return { statusCode: 200, body: { settings: sanitizeSettings(stored?.settings) } }
  }

  async function saveSettings(payload) {
    const settings = sanitizeSettings(payload.settings)
    await writeJson(SETTINGS_KEY, { settings })
    return { statusCode: 200, body: { settings } }
  }

  // Returns null when the path is not a journal route.
  return async function handle({ method, path, payload = {}, query = {} }) {
    if (!path.startsWith('/admin/journal')) return null
    if (method === 'GET' && path === '/admin/journal/data') return getData(query)
    if (method === 'GET' && path === '/admin/journal/settings') return getSettings()
    if (method === 'POST' && path === '/admin/journal/settings') return saveSettings(payload)
    if (method === 'POST' && path === '/admin/journal/trade') return saveTrade(payload)
    if (method === 'POST' && path === '/admin/journal/trades/import') return importTrades(payload)
    if (method === 'DELETE' && path === '/admin/journal/trade') return deleteTrade(query)
    if (method === 'POST' && path === '/admin/journal/day') return saveDay(payload)
    if (method === 'GET' && path === '/admin/journal/accounts') return getAccounts()
    if (method === 'POST' && path === '/admin/journal/accounts') return saveAccount(payload)
    return null
  }
}

module.exports = { createJournalApi, sanitizeTrade, sanitizeDay, sanitizeSettings, sanitizeMt5Account, isRealDate }
