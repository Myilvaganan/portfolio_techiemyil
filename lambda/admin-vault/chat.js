// "Ask my data": a chat that answers only from what is stored in the vault.
//
//   GET  /admin/chat/sources                         what the assistant can see (counts and date ranges)
//   POST /admin/chat  { messages: [{role, content}] } { answer, sources, followUps, queries }
//
// Nothing is answered from general knowledge. Every request reads the current data straight from S3, so anything uploaded
// later is included automatically. The steps:
//   1. Build a compact overview of every source (balances, monthly totals, loans, health, lending, goals, journal...).
//   2. A short planning call decides which detailed look-ups the question needs (search / total / group transactions or trades).
//   3. The look-ups run here, in code, on the real data.
//   4. An answering call writes the reply using only the overview and those results, naming the sources it used.

const { GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3')

const ROOT = '_data'
const CACHE_MS = 45_000
const MAX_QUERIES = 4
const MAX_ROWS = 40
const MAX_HISTORY = 6
const MAX_MESSAGE = 1500

// Some files are arrays and some are objects keyed by year or id; either way this gives back a list.
const asList = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : [])
const round2 = (n) => Math.round(n * 100) / 100
const sum = (xs) => xs.reduce((s, x) => s + x, 0)
const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`
const pad = (n) => String(n).padStart(2, '0')
const today = (now) => now().toISOString().slice(0, 10)

// Money moved between the user's own accounts and card bill payments are not spending.
const NOT_SPEND = new Set(['Transfer', 'Card Payment'])
const isCardBill = (t) => /credit ca|card payment|icici bank credit/i.test(`${t.merchant} ${t.description}`)

function createChatApi({ s3, bucket, callOpenAI, model, now = () => new Date() }) {
  let cache = null

  async function getJson(key, fallback = null) {
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      return JSON.parse(await out.Body.transformToString())
    } catch (err) {
      if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) return fallback
      throw err
    }
  }

  async function listKeys(prefix) {
    const keys = []
    let token
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }))
      keys.push(...(page.Contents || []).map((o) => o.Key))
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    return keys
  }

  /** Everything the assistant may use, read fresh (with a short cache so a conversation stays quick). */
  async function loadData() {
    if (cache && now().getTime() - cache.at < CACHE_MS) return cache.data
    const soft = (p, fallback) => p.catch(() => fallback)
    const journalKeys = (await soft(listKeys(`${ROOT}/journal/`), [])).filter((k) => /\/\d{4}-\d{2}\.json$/.test(k))
    const [bank, card, loan, health, healthGoal, healthLogs, lending, budgets, tags, rules, goals, snapshots, tax, capGains, reminders, mt5, journalSettings] = await Promise.all([
      soft(getJson(`${ROOT}/statements/bank/data.json`), null),
      soft(getJson(`${ROOT}/statements/card/data.json`), null),
      soft(getJson(`${ROOT}/statements/loan/data.json`), null),
      soft(getJson(`${ROOT}/health/reports.json`), null),
      soft(getJson(`${ROOT}/health/goal.json`), null),
      soft(getJson(`${ROOT}/health/logs.json`), null),
      soft(getJson(`${ROOT}/lending/entries.json`), null),
      soft(getJson(`${ROOT}/finance/budgets.json`), null),
      soft(getJson(`${ROOT}/finance/tags.json`), null),
      soft(getJson(`${ROOT}/finance/rules.json`), null),
      soft(getJson(`${ROOT}/wealth/goals.json`), null),
      soft(getJson(`${ROOT}/wealth/snapshots.json`), null),
      soft(getJson(`${ROOT}/tax/returns.json`), null),
      soft(getJson(`${ROOT}/invest/capital-gains.json`), null),
      soft(getJson(`${ROOT}/invest/reminders.json`), null),
      soft(getJson(`${ROOT}/journal/mt5-accounts.json`), null),
      soft(getJson(`${ROOT}/journal/settings.json`), null),
    ])
    const months = await Promise.all(journalKeys.map((k) => soft(getJson(k), null)))
    const trades = months.flatMap((m) => (m && m.trades) || [])
    const data = { bank, card, loan, health, healthGoal, healthLogs, lending, budgets, tags, rules, goals, snapshots, tax, capGains, reminders, mt5, journalSettings, trades }
    cache = { at: now().getTime(), data }
    return data
  }

  // ---------- Overview ----------

  const txnsOf = (s) => (s && Array.isArray(s.transactions) ? s.transactions : [])
  const range = (list) => {
    const dates = list.map((t) => t.date).filter(Boolean).sort()
    return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null
  }

  function monthlyBank(bank, months) {
    const out = {}
    for (const t of bank) {
      const m = t.date.slice(0, 7)
      const o = (out[m] = out[m] || { income: 0, spend: 0 })
      if (NOT_SPEND.has(t.category) || isCardBill(t)) continue
      if (t.credit && ['Salary', 'Other Income', 'Interest'].includes(t.category)) o.income += t.credit
      if (t.debit && t.category !== 'Investments') o.spend += t.debit
    }
    return Object.keys(out).sort().slice(-months).map((m) => ({ month: m, income: Math.round(out[m].income), spend: Math.round(out[m].spend) }))
  }

  function topBy(list, key, from, limit) {
    const map = new Map()
    for (const t of list) {
      if (!t.debit || t.date < from || NOT_SPEND.has(t.category) || isCardBill(t)) continue
      const k = t[key] || 'Other'
      map.set(k, (map.get(k) || 0) + t.debit)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, total]) => ({ name, total: Math.round(total) }))
  }

  function latestBalances(bankData) {
    const by = new Map()
    for (const t of txnsOf(bankData)) if (t.balance != null && (!by.has(t.accountKey) || t.date >= by.get(t.accountKey).date)) by.set(t.accountKey, { date: t.date, balance: t.balance })
    return [...by.entries()].map(([account, v]) => ({ account, asOf: v.date, balance: Math.round(v.balance) }))
  }

  function loanOverview(loanData, todayStr) {
    if (!loanData || !Array.isArray(loanData.statements)) return []
    const accounts = new Map()
    for (const s of loanData.statements) {
      const p = s.parsed || s
      const a = accounts.get(s.accountNo) || { accountNo: s.accountNo }
      if (s.docType === 'statement') {
        a.details = p.details
        a.summary = p.summary
        a.recentEvents = (p.events || []).slice(-6)
        a.statementUploaded = s.uploadedAt
      } else if (s.docType === 'schedule') {
        const rows = p.rows || []
        const upcoming = rows.filter((r) => r.date >= todayStr)
        a.schedule = { instalments: rows.length, remaining: upcoming.length, next: upcoming.slice(0, 3), last: rows[rows.length - 1] || null }
      }
      accounts.set(s.accountNo, a)
    }
    return [...accounts.values()]
  }

  function lendingOverview(entries, todayStr) {
    return asList(entries).map((e) => {
      const received = sum(asList(e.repayments).map((r) => r.amount))
      const days = Math.max(0, Math.round((Date.parse(`${todayStr}T00:00:00Z`) - Date.parse(`${e.date}T00:00:00Z`)) / 86_400_000))
      const interest = e.amount * ((e.interestRatePct || 0) / 100) * (days / 365)
      return { name: e.name, lent: e.amount, date: e.date, dueDate: e.dueDate || null, interestRatePct: e.interestRatePct || 0, received, stillOwes: Math.max(0, round2(e.amount + interest - received)), note: e.note || '', payments: asList(e.repayments).slice(-5).map((r) => ({ date: r.date, amount: r.amount })), borrowedToLend: e.passThrough || null }
    })
  }

  function journalOverview(trades) {
    const by = {}
    for (const t of trades) {
      const m = t.date.slice(0, 7)
      const k = `${m}|${t.currency || 'INR'}|${t.account ? 'forex' : 'options'}`
      const o = (by[k] = by[k] || { month: m, book: t.account ? 'forex' : 'options', currency: t.currency || 'INR', trades: 0, net: 0 })
      o.trades++
      o.net += t.grossPnl - (t.fees || 0)
    }
    return Object.values(by).sort((a, b) => a.month.localeCompare(b.month)).slice(-18).map((o) => ({ ...o, net: round2(o.net) }))
  }

  function coverage(d) {
    const bank = txnsOf(d.bank)
    const card = txnsOf(d.card)
    return [
      { source: 'Bank statements', detail: bank.length ? `${bank.length} transactions, ${range(bank).from} to ${range(bank).to}` : 'nothing uploaded' },
      { source: 'Credit cards', detail: card.length ? `${card.length} transactions, ${range(card).from} to ${range(card).to}` : 'nothing uploaded' },
      { source: 'Loans', detail: d.loan && d.loan.statements ? `${new Set(d.loan.statements.map((s) => s.accountNo)).size} loan accounts` : 'nothing uploaded' },
      { source: 'Trading journal', detail: d.trades.length ? `${d.trades.length} trades, ${range(d.trades).from} to ${range(d.trades).to}` : 'no trades' },
      { source: 'Health', detail: d.health && d.health.reports ? `${asList(d.health.reports).length} InBody reports` : 'no reports' },
      { source: 'Lending', detail: d.lending && d.lending.entries ? `${asList(d.lending.entries).length} people` : 'no entries' },
      { source: 'Budgets & goals', detail: `${Object.keys((d.budgets && d.budgets.budgets) || {}).length} budgets, ${asList(d.goals && d.goals.goals).length} goals` },
      { source: 'Net worth history', detail: d.snapshots && d.snapshots.snapshots ? `${asList(d.snapshots.snapshots).length} monthly snapshots` : 'no snapshots' },
      { source: 'Tax returns', detail: d.tax && d.tax.returns ? `${asList(d.tax.returns).length} years` : 'none saved' },
    ]
  }

  function buildOverview(d) {
    const t = today(now)
    const bank = txnsOf(d.bank)
    const card = txnsOf(d.card)
    const yearAgo = `${Number(t.slice(0, 4)) - 1}${t.slice(4)}`
    const threeMonths = new Date(now().getTime() - 92 * 86_400_000).toISOString().slice(0, 10)
    const healthReports = asList(d.health && d.health.reports).slice().sort((a, b) => a.testedAt.localeCompare(b.testedAt))
    const view = {
      today: t,
      note: 'All amounts are rupees unless a currency is shown. "Transfer" means money moved between the owner\'s own accounts or to family and is not spending. Categories come from automatic reading of statements and "Other" means unsorted.',
      coverage: coverage(d),
      bank: bank.length
        ? {
            latestBalances: latestBalances(d.bank),
            monthlyIncomeAndSpend: monthlyBank(bank, 12),
            topSpendCategoriesLast3Months: topBy(bank, 'category', threeMonths, 10),
            topSpendCategoriesLast12Months: topBy(bank, 'category', yearAgo, 12),
            topMerchantsLast12Months: topBy(bank, 'merchant', yearAgo, 15),
            statementPeriods: ((d.bank && d.bank.statements) || []).map((s) => `${s.bank} ${s.accountKey} ${s.periodFrom}..${s.periodTo}`),
          }
        : null,
      card: card.length ? { topMerchantsLast12Months: topBy(card, 'merchant', yearAgo, 12), topCategoriesLast12Months: topBy(card, 'category', yearAgo, 8), statements: ((d.card && d.card.statements) || []).slice(-8).map((s) => ({ card: s.accountKey, period: `${s.periodFrom}..${s.periodTo}`, totalDue: s.totalDue ?? null, minDue: s.minDue ?? null, dueDate: s.dueDate ?? null, creditLimit: s.creditLimit ?? null })) } : null,
      loans: loanOverview(d.loan, t),
      lending: lendingOverview(asList(d.lending && d.lending.entries), t),
      health: healthReports.length ? { latest: healthReports[healthReports.length - 1], previousWeights: healthReports.slice(-6).map((r) => ({ date: r.testedAt.slice(0, 10), weightKg: r.values && r.values.weight, bodyFatPct: r.values && r.values.percentBodyFat })), goal: d.healthGoal || null } : null,
      budgets: (d.budgets && d.budgets.budgets) || {},
      goals: asList(d.goals && d.goals.goals),
      netWorthHistory: asList(d.snapshots && d.snapshots.snapshots).slice(-12),
      tradingJournalMonthly: journalOverview(d.trades),
      forexAccounts: d.mt5 && d.mt5.accounts ? Object.values(d.mt5.accounts).map((a) => ({ account: a.account, name: a.name, currency: a.currency, balance: a.balance, equity: a.equity })) : [],
      taxReturnsByYear: (d.tax && d.tax.returns) || {},
      capitalGains: (d.capGains && d.capGains.years) || {},
      reminders: asList(d.reminders && d.reminders.reminders),
    }
    return JSON.stringify(view)
  }

  const safeOverview = (d) => {
    try {
      return buildOverview(d)
    } catch (err) {
      console.error('overview failed', err)
      return JSON.stringify({ today: today(now), coverage: coverage(d), note: 'Some sources could not be summarised.' })
    }
  }

  // ---------- Look-ups ----------

  const like = (hay, needle) => String(hay || '').toLowerCase().includes(needle.toLowerCase())

  /** Runs one planned look-up on the real data. Everything is validated; nothing here comes from the model unchecked. */
  function runQuery(q, d) {
    const source = ['bank', 'card', 'journal'].includes(q.source) ? q.source : null
    if (!source) return { label: 'unknown source', error: 'Unknown source.' }
    const list = source === 'bank' ? txnsOf(d.bank) : source === 'card' ? txnsOf(d.card) : d.trades
    const dir = ['debit', 'credit', 'any'].includes(q.direction) ? q.direction : 'any'
    const text = typeof q.text === 'string' ? q.text.trim().slice(0, 60) : ''
    const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : ''
    const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : ''
    const limit = Math.min(Math.max(Number(q.limit) || 20, 1), MAX_ROWS)
    const label = `${source}${text ? ` "${text}"` : ''}${q.category ? ` ${q.category}` : ''}${from || to ? ` ${from || '…'}..${to || '…'}` : ''}`

    const amountOf = (t) => (source === 'journal' ? t.grossPnl - (t.fees || 0) : dir === 'credit' ? t.credit : dir === 'debit' ? t.debit : t.debit || t.credit)
    let rows = list.filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
    if (text) rows = rows.filter((t) => (source === 'journal' ? like(`${t.instrument} ${t.symbol} ${t.strategy} ${t.notes} ${t.direction}`, text) : like(`${t.merchant} ${t.description} ${t.category}`, text)))
    if (q.category && source !== 'journal') rows = rows.filter((t) => t.category === q.category)
    if (source !== 'journal') {
      if (dir === 'debit') rows = rows.filter((t) => t.debit > 0)
      if (dir === 'credit') rows = rows.filter((t) => t.credit > 0)
      if (typeof q.minAmount === 'number') rows = rows.filter((t) => (t.debit || t.credit) >= q.minAmount)
      if (typeof q.maxAmount === 'number') rows = rows.filter((t) => (t.debit || t.credit) <= q.maxAmount)
    }

    const shape = (t) => (source === 'journal' ? { date: t.date, instrument: t.instrument, symbol: t.symbol, direction: t.direction, net: round2(t.grossPnl - (t.fees || 0)), currency: t.currency, strategy: t.strategy || undefined } : { date: t.date, merchant: t.merchant, description: String(t.description).slice(0, 80), debit: t.debit || undefined, credit: t.credit || undefined, category: t.category })

    if (q.op === 'sum') {
      const byCurrency = {}
      for (const t of rows) {
        const c = source === 'journal' ? t.currency || 'INR' : 'INR'
        byCurrency[c] = round2((byCurrency[c] || 0) + amountOf(t))
      }
      return { label, count: rows.length, total: byCurrency }
    }
    if (q.op === 'group') {
      const key = { month: (t) => t.date.slice(0, 7), category: (t) => t.category || t.instrument || 'Other', merchant: (t) => t.merchant || t.instrument || 'Other' }[q.groupBy] || ((t) => t.date.slice(0, 7))
      const map = new Map()
      for (const t of rows) {
        const k = key(t)
        const o = map.get(k) || { name: k, count: 0, total: 0 }
        o.count++
        o.total += amountOf(t)
        map.set(k, o)
      }
      const groups = [...map.values()].map((o) => ({ ...o, total: round2(o.total) }))
      groups.sort(q.groupBy === 'month' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => Math.abs(b.total) - Math.abs(a.total))
      return { label, count: rows.length, groups: groups.slice(0, MAX_ROWS) }
    }
    const sorted = [...rows].sort((a, b) => (q.sort === 'amount' ? Math.abs(amountOf(b)) - Math.abs(amountOf(a)) : b.date.localeCompare(a.date)))
    return { label, count: rows.length, showing: Math.min(limit, rows.length), rows: sorted.slice(0, limit).map(shape) }
  }

  // ---------- The model steps ----------

  const nstr = { type: ['string', 'null'] }
  const nnum = { type: ['number', 'null'] }
  const PLAN_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['queries'],
    properties: {
      queries: {
        type: 'array',
        maxItems: MAX_QUERIES,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['source', 'op', 'text', 'category', 'from', 'to', 'direction', 'minAmount', 'maxAmount', 'groupBy', 'sort', 'limit'],
          properties: {
            source: { type: 'string', enum: ['bank', 'card', 'journal'] },
            op: { type: 'string', enum: ['list', 'sum', 'group'] },
            text: nstr,
            category: nstr,
            from: nstr,
            to: nstr,
            direction: { type: 'string', enum: ['debit', 'credit', 'any'] },
            minAmount: nnum,
            maxAmount: nnum,
            groupBy: { type: ['string', 'null'], enum: ['month', 'category', 'merchant', null] },
            sort: { type: ['string', 'null'], enum: ['date', 'amount', null] },
            limit: nnum,
          },
        },
      },
    },
  }
  const ANSWER_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'sources', 'followUps', 'inScope'],
    properties: {
      answer: { type: 'string' },
      sources: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      followUps: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      inScope: { type: 'boolean' },
    },
  }

  const PLAN_SYSTEM = `You decide which detailed look-ups are needed to answer a question about one person's own financial, trading, health and lending records.
You are given an OVERVIEW of every source and the conversation. Return up to ${MAX_QUERIES} look-ups ONLY when the question needs transaction-level or trade-level detail that the overview does not already contain (for example "how much did I spend on Zomato in March", "my biggest expenses last month", "what did I pay Appusamy", "my Bitcoin trades this month"). Return an empty list when the overview is enough or the question is not about the data.
Look-up fields: source (bank = savings account, card = credit cards, journal = trades), op (list, sum or group), text (word to find in merchant, description, instrument or strategy), category (exact statement category or null), from/to (YYYY-MM-DD or null), direction (debit = money out, credit = money in, any), minAmount/maxAmount, groupBy (month, category or merchant, for op=group), sort (date or amount), limit (rows for op=list, at most ${MAX_ROWS}).
Resolve relative dates ("last month", "this year", "in March") using today's date from the overview. Spending questions should use direction=debit and should not include category Transfer.`

  const ANSWER_SYSTEM = `You are the private assistant for one person's finance vault. You answer ONLY from the DATA supplied below (an overview plus look-up results) and the conversation.
Rules:
- Never use outside knowledge, never guess, never invent a number. If the data does not contain the answer, say exactly what is missing (for example "there are no bank statements after 7 Sep 2026") and what could be uploaded to answer it.
- If the question is not about this person's data (general knowledge, coding, advice unrelated to the records), set inScope to false and reply in one sentence that you can only answer from their uploaded data.
- Use Indian number format with the ₹ sign (₹1,25,000). Give dates like 5 Sep 2026. Be concise: lead with the answer, then at most a short list of supporting figures.
- Say which period a figure covers and note when the records stop, because uploads may be behind.
- Money marked Transfer is between the owner's own accounts or family and is not spending. When a look-up result is truncated (count larger than rows shown), say so.
- sources: the names of the parts of the vault you used, e.g. "Bank statements", "Credit cards", "Loans", "Trading journal", "Health", "Lending", "Budgets & goals", "Net worth history", "Tax returns".
- followUps: up to three short questions the data could also answer.`

  const clip = (s, n) => String(s || '').slice(0, n)
  const cleanHistory = (messages) =>
    (Array.isArray(messages) ? messages : [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: clip(m.content.trim(), MAX_MESSAGE) }))

  async function ask(payload) {
    const history = cleanHistory(payload && payload.messages)
    const last = history[history.length - 1]
    if (!last || last.role !== 'user') return { statusCode: 400, body: { error: 'Ask a question first.' } }

    const data = await loadData()
    const overview = safeOverview(data)
    const convo = history.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')

    const plan = await callOpenAI({ model, system: PLAN_SYSTEM, user: `OVERVIEW:\n${overview}\n\nCONVERSATION:\n${convo}`, name: 'lookup_plan', schema: PLAN_SCHEMA, effort: 'low', timeoutMs: 9000, maxTokens: 1200 })
    const results = (plan.queries || []).slice(0, MAX_QUERIES).map((q) => runQuery(q, data))

    const answer = await callOpenAI({
      model,
      system: ANSWER_SYSTEM,
      user: `DATA OVERVIEW:\n${overview}\n\nLOOK-UP RESULTS:\n${results.length ? JSON.stringify(results) : '(none needed)'}\n\nCONVERSATION:\n${convo}\n\nAnswer the last user message.`,
      name: 'answer',
      schema: ANSWER_SCHEMA,
      effort: 'low',
      timeoutMs: 14000,
      maxTokens: 1800,
    })
    return { statusCode: 200, body: { answer: clip(answer.answer, 4000), sources: answer.inScope ? (answer.sources || []).slice(0, 6) : [], followUps: (answer.followUps || []).slice(0, 3).map((f) => clip(f, 120)), inScope: Boolean(answer.inScope), queries: results.map((r) => r.label) } }
  }

  async function sources() {
    return { statusCode: 200, body: { coverage: coverage(await loadData()) } }
  }

  async function route({ method, path, payload }) {
    try {
      if (method === 'GET' && path === '/admin/chat/sources') return await sources()
      if (method === 'POST' && path === '/admin/chat') return await ask(payload)
      return null
    } catch (err) {
      // The AI helper throws errors that already carry a friendly message and status (no credits, busy, timeout).
      if (err && err.statusCode && err.code) return { statusCode: err.statusCode, body: { error: err.message, code: err.code } }
      throw err
    }
  }

  return { route, runQuery, buildOverview, loadData }
}

module.exports = { createChatApi }
