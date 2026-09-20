import { describe, expect, it } from 'vitest'
import {
  aiContext,
  anomalies,
  balanceSeries,
  bankKpis,
  cardsSummary,
  categoryTotals,
  filterTxns,
  fingerprint,
  merchantTotals,
  monthlyFlow,
  monthlySpendByCard,
  recurringCharges,
  topWithOther,
  weekdaySpend,
  type Statement,
  type StatementsData,
  type Txn,
} from './statements'

let n = 0
const tx = (date: string, merchant: string, debit: number, credit: number, category: string, extra: Partial<Txn> = {}): Txn => ({
  id: `t${++n}`,
  statementId: 's1',
  accountKey: 'icici:9012',
  date,
  description: merchant,
  merchant,
  debit,
  credit,
  category,
  ...extra,
})

const bank: Txn[] = [
  tx('2026-06-01', 'Acme (salary)', 0, 100000, 'Salary', { balance: 120000 }),
  tx('2026-06-03', 'Netflix', 649, 0, 'Subscriptions', { balance: 119351 }),
  tx('2026-06-10', 'Swiggy', 500, 0, 'Food & Dining', { balance: 118851 }),
  tx('2026-06-15', 'Self transfer', 20000, 0, 'Transfer', { balance: 98851 }),
  tx('2026-07-01', 'Acme (salary)', 0, 100000, 'Salary', { balance: 198851 }),
  tx('2026-07-03', 'Netflix', 649, 0, 'Subscriptions', { balance: 198202 }),
  tx('2026-07-12', 'Swiggy', 700, 0, 'Food & Dining', { balance: 197502 }),
  tx('2026-08-01', 'Acme (salary)', 0, 100000, 'Salary', { balance: 297502 }),
  tx('2026-08-03', 'Netflix', 649, 0, 'Subscriptions', { balance: 296853 }),
  tx('2026-08-14', 'Swiggy', 600, 0, 'Food & Dining', { balance: 296253 }),
]

describe('bank analytics', () => {
  it('builds monthly cash flow and can leave out transfers', () => {
    const withT = monthlyFlow('bank', bank)
    expect(withT.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(withT[0]).toMatchObject({ income: 100000, spend: 21149, net: 78851 })
    expect(monthlyFlow('bank', bank, { excludeTransfers: true })[0].spend).toBe(1149)
    expect(withT[0].savingsRate).toBeCloseTo(78.851, 2)
  })

  it('totals categories and merchants, and folds the tail into Other', () => {
    const cats = categoryTotals('bank', bank)
    expect(cats[0]).toMatchObject({ label: 'Transfer', value: 20000 })
    expect(merchantTotals('bank', bank)[0].label).toBe('Self transfer')
    const folded = topWithOther(cats, 2)
    expect(folded).toHaveLength(3)
    expect(folded[2].label).toBe('Other (1)')
    expect(folded.reduce((s, x) => s + x.value, 0)).toBeCloseTo(cats.reduce((s, x) => s + x.value, 0))
  })

  it('finds steady recurring charges but not one-offs', () => {
    const r = recurringCharges('bank', bank)
    expect(r.map((x) => x.merchant)).toContain('Netflix')
    expect(r.find((x) => x.merchant === 'Netflix')).toMatchObject({ monthly: 649, months: 3, annual: 7788 })
    expect(r.map((x) => x.merchant)).not.toContain('Self transfer')
  })

  it('computes KPIs and a balance series', () => {
    const k = bankKpis(bank, [], { excludeTransfers: true })
    expect(k.income).toBe(300000)
    expect(k.months).toBe(3)
    expect(k.latestBalance).toBe(296253)
    expect(k.runwayMonths).toBeGreaterThan(100)
    expect(k.largest?.merchant).toBe('Swiggy')
    expect(balanceSeries(bank)).toHaveLength(10)
    expect(balanceSeries(bank.map((t) => ({ ...t, balance: null })))).toEqual([])
  })

  it('flags an unusually large debit in a category', () => {
    const many = [...Array.from({ length: 12 }, (_, i) => tx(`2026-08-${String(i + 1).padStart(2, '0')}`, 'Swiggy', 400 + i * 10, 0, 'Food & Dining')), tx('2026-08-20', 'Fancy Dinner', 9000, 0, 'Food & Dining')]
    expect(anomalies('bank', many)[0].merchant).toBe('Fancy Dinner')
    expect(anomalies('bank', bank)).toEqual([])
  })

  it('filters by date, category, direction and text', () => {
    expect(filterTxns(bank, { from: '2026-07-01', to: '2026-07-31' })).toHaveLength(3)
    expect(filterTxns(bank, { category: 'Subscriptions' })).toHaveLength(3)
    expect(filterTxns(bank, { direction: 'credit' })).toHaveLength(3)
    expect(filterTxns(bank, { search: 'swig' })).toHaveLength(3)
  })

  it('weekday spend covers seven days and totals match', () => {
    const w = weekdaySpend('bank', bank)
    expect(w).toHaveLength(7)
    expect(w.reduce((s, x) => s + x.value, 0)).toBeCloseTo(monthlyFlow('bank', bank).reduce((s, m) => s + m.spend, 0))
  })

  it('fingerprint changes when data changes', () => {
    expect(fingerprint(bank)).toBe(fingerprint([...bank]))
    expect(fingerprint(bank)).not.toBe(fingerprint(bank.slice(1)))
  })
})

describe('card analytics', () => {
  const c1 = (date: string, merchant: string, debit: number, credit: number, category: string, type: string, key = 'icici:8842') =>
    tx(date, merchant, debit, credit, category, { accountKey: key, type })
  const cardTx: Txn[] = [
    c1('2026-08-14', 'Amazon', 1299, 0, 'Shopping', 'purchase'),
    c1('2026-08-15', 'Swiggy', 452, 0, 'Food & Dining', 'purchase'),
    c1('2026-08-19', 'ICICI Bank', 0, 12000, 'Card Payment', 'payment'),
    c1('2026-08-27', 'ICICI Bank', 412.3, 0, 'Fees & Interest', 'interest'),
    c1('2026-08-30', 'Amazon Pay', 0, 150, 'Cashback & Rewards', 'cashback'),
    c1('2026-09-02', 'Bigbasket', 3000, 0, 'Groceries', 'purchase', 'icici:1111'),
  ]
  const statements = [
    { id: 's1', kind: 'card', accountKey: 'icici:8842', cardLast4: '8842', cardName: 'Amazon Pay ICICI', creditLimit: 200000, totalDue: 20000, minDue: 900, dueDate: '2026-10-02', periodTo: '2026-09-12', uploadedAt: 'x' },
    { id: 's2', kind: 'card', accountKey: 'icici:1111', cardLast4: '1111', cardName: 'Coral', creditLimit: 100000, totalDue: 3000, periodTo: '2026-09-12', uploadedAt: 'x' },
  ] as unknown as Statement[]

  it('summarises each card, excluding payments from spend', () => {
    const cards = cardsSummary(cardTx, statements)
    expect(cards.map((c) => c.last4)).toEqual(['1111', '8842'])
    const main = cards.find((c) => c.last4 === '8842')!
    expect(main).toMatchObject({ purchases: 1751, feesInterest: 412.3, payments: 12000, refunds: 150, utilisation: 10 })
    expect(main.spend).toBeCloseTo(1751 + 412.3)
    expect(cards[0].utilisation).toBe(3)
  })

  it('splits monthly spend by card', () => {
    const m = monthlySpendByCard(cardTx)
    expect(m.months).toEqual(['2026-08', '2026-09'])
    expect(m.values['icici:8842']).toEqual([2163.3, 0])
    expect(m.values['icici:1111']).toEqual([0, 3000])
  })

  it('builds compact AI context per kind', () => {
    const cardCtx = aiContext('card', { statements, transactions: cardTx, insights: null } as StatementsData) as unknown as { cards: unknown[]; totals: { feesAndInterest: number } }
    expect(cardCtx.cards).toHaveLength(2)
    expect(cardCtx.totals.feesAndInterest).toBeCloseTo(412.3)
    const bankCtx = aiContext('bank', { statements: [], transactions: bank, insights: null }) as unknown as { totals: { income: number }; monthly: unknown[] }
    expect(bankCtx.totals.income).toBe(300000)
    expect(bankCtx.monthly).toHaveLength(3)
    expect(JSON.stringify(bankCtx).length).toBeLessThan(6000)
  })
})
