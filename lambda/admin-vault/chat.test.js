import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { createChatApi } = require('./chat.js')

const bank = [
  { id: 'a1', date: '2026-08-05', description: 'UPI/Appu Samy/x@idib', merchant: 'Appusamy', debit: 10000, credit: 0, category: 'Rent', balance: 90000, accountKey: 'icici:6512' },
  { id: 'a2', date: '2026-08-07', description: 'UPI/Zomato/order', merchant: 'Zomato', debit: 450, credit: 0, category: 'Food & Dining', balance: 89550, accountKey: 'icici:6512' },
  { id: 'a3', date: '2026-09-07', description: 'UPI/Zomato/order', merchant: 'Zomato', debit: 300, credit: 0, category: 'Food & Dining', balance: 80000, accountKey: 'icici:6512' },
  { id: 'a4', date: '2026-08-01', description: 'NEFT SALARY ACME', merchant: 'Acme', debit: 0, credit: 120000, category: 'Salary', balance: 200000, accountKey: 'icici:6512' },
  { id: 'a5', date: '2026-08-10', description: 'UPI/S MYILVAG', merchant: 'Own account', debit: 20000, credit: 0, category: 'Transfer', balance: 70000, accountKey: 'icici:6512' },
]
const trades = [
  { id: 't1', date: '2026-09-02', instrument: 'Bitcoin', symbol: 'BTCUSD', direction: 'BUY', grossPnl: 40, fees: 0, currency: 'USD', account: '1' },
  { id: 't2', date: '2026-09-03', instrument: 'Options', symbol: 'NIFTY 25000 CE', direction: 'BUY', grossPnl: 1000, fees: 40, currency: 'INR' },
]

function fakeS3(files) {
  return {
    send: async (cmd) => {
      const name = cmd.constructor.name
      if (name === 'ListObjectsV2Command') {
        return { Contents: Object.keys(files).filter((k) => k.startsWith(cmd.input.Prefix)).map((Key) => ({ Key })), IsTruncated: false }
      }
      const f = files[cmd.input.Key]
      if (f === undefined) throw Object.assign(new Error('x'), { name: 'NoSuchKey' })
      return { Body: { transformToString: async () => JSON.stringify(f) } }
    },
  }
}

const files = {
  '_data/statements/bank/data.json': { statements: [{ bank: 'icici', accountKey: 'icici:6512', periodFrom: '2026-08-01', periodTo: '2026-09-07' }], transactions: bank },
  '_data/journal/2026-09.json': { trades, days: {} },
  '_data/lending/entries.json': { entries: [{ id: 'e1', name: 'Ravi', amount: 650000, date: '2025-04-01', interestRatePct: 0, repayments: [{ id: 'r', date: '2026-01-01', amount: 100000 }] }] },
  '_data/health/reports.json': { reports: [{ testedAt: '2026-09-24T07:13', values: { weight: 95.9, percentBodyFat: 38.4 } }] },
}
const NOW = () => new Date('2026-09-26T10:00:00Z')
const make = (callOpenAI) => createChatApi({ s3: fakeS3(files), bucket: 'b', callOpenAI, model: 'm', now: NOW })

describe('chat look-ups', () => {
  const api = make(async () => ({}))
  const data = () => api.loadData()

  it('sums debits for a merchant in a date range', async () => {
    const r = api.runQuery({ source: 'bank', op: 'sum', text: 'zomato', from: '2026-08-01', to: '2026-08-31', direction: 'debit' }, await data())
    expect(r).toMatchObject({ count: 1, total: { INR: 450 } })
  })

  it('groups spending by month and lists the biggest rows', async () => {
    const d = await data()
    const g = api.runQuery({ source: 'bank', op: 'group', groupBy: 'month', direction: 'debit', category: 'Food & Dining' }, d)
    expect(g.groups).toEqual([{ name: '2026-08', count: 1, total: 450 }, { name: '2026-09', count: 1, total: 300 }])
    const l = api.runQuery({ source: 'bank', op: 'list', direction: 'debit', sort: 'amount', limit: 2 }, d)
    expect(l.rows.map((x) => x.debit)).toEqual([20000, 10000])
    expect(l).toMatchObject({ count: 4, showing: 2 })
  })

  it('totals trades per currency and rejects an unknown source', async () => {
    const d = await data()
    expect(api.runQuery({ source: 'journal', op: 'sum', text: 'bitcoin' }, d).total).toEqual({ USD: 40 })
    expect(api.runQuery({ source: 'journal', op: 'sum' }, d).total).toEqual({ USD: 40, INR: 960 })
    expect(api.runQuery({ source: 'secrets', op: 'list' }, d).error).toBeTruthy()
  })

  it('builds an overview from every source, leaving own-account transfers out of spending', async () => {
    const o = JSON.parse(api.buildOverview(await data()))
    expect(o.bank.monthlyIncomeAndSpend).toEqual([{ month: '2026-08', income: 120000, spend: 10450 }, { month: '2026-09', income: 0, spend: 300 }])
    expect(o.bank.latestBalances).toEqual([{ account: 'icici:6512', asOf: '2026-09-07', balance: 80000 }])
    expect(o.lending[0]).toMatchObject({ name: 'Ravi', stillOwes: 550000 })
    expect(o.health.latest.values.weight).toBe(95.9)
    expect(o.tradingJournalMonthly).toHaveLength(2)
    expect(o.coverage.find((c) => c.source === 'Tax returns').detail).toBe('none saved')
  })
})

describe('chat api', () => {
  it('plans look-ups, runs them on the data, and answers from the results only', async () => {
    const calls = []
    const api = make(async (req) => {
      calls.push(req)
      if (req.name === 'lookup_plan') return { queries: [{ source: 'bank', op: 'sum', text: 'zomato', category: null, from: null, to: null, direction: 'debit', minAmount: null, maxAmount: null, groupBy: null, sort: null, limit: null }] }
      return { answer: 'You spent ₹750 on Zomato.', sources: ['Bank statements'], followUps: ['And on Swiggy?'], inScope: true }
    })
    const res = await api.route({ method: 'POST', path: '/admin/chat', payload: { messages: [{ role: 'user', content: 'How much on Zomato?' }] } })
    expect(res.body).toMatchObject({ answer: 'You spent ₹750 on Zomato.', sources: ['Bank statements'], inScope: true })
    expect(res.body.queries[0]).toContain('zomato')
    expect(calls).toHaveLength(2)
    expect(calls[1].user).toContain('"total":{"INR":750}')
    expect(calls[1].system).toMatch(/ONLY from the DATA/)
  })

  it('drops the sources on an out-of-scope question and validates the input', async () => {
    const api = make(async (req) => (req.name === 'lookup_plan' ? { queries: [] } : { answer: 'I can only answer from your uploaded data.', sources: ['Bank statements'], followUps: [], inScope: false }))
    const res = await api.route({ method: 'POST', path: '/admin/chat', payload: { messages: [{ role: 'user', content: 'Who won the world cup?' }] } })
    expect(res.body).toMatchObject({ inScope: false, sources: [] })
    expect((await api.route({ method: 'POST', path: '/admin/chat', payload: { messages: [] } })).statusCode).toBe(400)
    expect((await api.route({ method: 'POST', path: '/admin/chat', payload: { messages: [{ role: 'assistant', content: 'hi' }] } })).statusCode).toBe(400)
  })

  it('keeps only the last few turns, trimmed', async () => {
    const seen = vi.fn(async (req) => (req.name === 'lookup_plan' ? { queries: [] } : { answer: 'ok', sources: [], followUps: [], inScope: true }))
    const api = make(seen)
    const messages = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` + 'x'.repeat(3000) }))
    messages.push({ role: 'user', content: 'last?' })
    await api.route({ method: 'POST', path: '/admin/chat', payload: { messages } })
    const convo = seen.mock.calls[0][0].user.split('CONVERSATION:\n')[1]
    expect(convo.split('\n').length).toBeLessThanOrEqual(6)
    expect(convo).toContain('last?')
    expect(convo.length).toBeLessThan(6 * 1600)
  })

  it('passes a friendly AI error through instead of a generic failure', async () => {
    const api = make(async () => {
      throw Object.assign(new Error('The AI is busy right now. Please retry in a moment.'), { code: 'ai_rate_limited', statusCode: 429 })
    })
    const res = await api.route({ method: 'POST', path: '/admin/chat', payload: { messages: [{ role: 'user', content: 'hi' }] } })
    expect(res).toEqual({ statusCode: 429, body: { error: 'The AI is busy right now. Please retry in a moment.', code: 'ai_rate_limited' } })
  })

  it('reports what data the assistant can see', async () => {
    const res = await make(async () => ({})).route({ method: 'GET', path: '/admin/chat/sources' })
    expect(res.body.coverage.find((c) => c.source === 'Bank statements').detail).toMatch(/5 transactions/)
    expect(res.body.coverage.find((c) => c.source === 'Lending').detail).toBe('1 people')
  })
})
