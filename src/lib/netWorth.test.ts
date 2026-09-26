import { describe, expect, it } from 'vitest'
import { bankAccountBalances, computeNetWorth, monthlyBankTotal } from './netWorth'
import type { Statement, Txn } from './statements'

let n = 0
const tx = (accountKey: string, date: string, balance: number | null, extra: Partial<Txn> = {}): Txn => ({
  id: `t${++n}`,
  statementId: 's1',
  accountKey,
  date,
  description: 'x',
  merchant: 'x',
  debit: 0,
  credit: 0,
  category: 'Other',
  balance: balance ?? undefined,
  ...extra,
})

const statement = (over: Partial<Statement>): Statement => ({
  id: 's1',
  kind: 'bank',
  filename: 'f.pdf',
  uploadedAt: '2026-08-01T00:00:00Z',
  pages: 1,
  fileKey: 'k',
  accountKey: 'icici:1234',
  txnCount: 1,
  duplicatesSkipped: 0,
  bank: 'icici',
  periodFrom: '2026-08-01',
  periodTo: '2026-08-31',
  ...over,
})

describe('bankAccountBalances', () => {
  it('takes the last transaction balance per account', () => {
    const txns = [tx('icici:1234', '2026-08-01', 10000), tx('icici:1234', '2026-08-15', 8000)]
    const rows = bankAccountBalances(txns, [statement({ accountLast4: '1234' })])
    expect(rows).toEqual([{ accountKey: 'icici:1234', label: 'ICICI ••1234', balance: 8000, asOf: '2026-08-15' }])
  })

  it('falls back to the statement closing balance when no transaction has one', () => {
    const rows = bankAccountBalances([], [statement({ accountLast4: '1234', closingBalance: 5500 })])
    expect(rows[0].balance).toBe(5500)
  })

  it('skips accounts with no known balance anywhere', () => {
    const rows = bankAccountBalances([tx('icici:1234', '2026-08-01', null)], [statement({ accountLast4: '1234', closingBalance: null })])
    expect(rows).toEqual([])
  })
})

describe('monthlyBankTotal', () => {
  it('forward-fills each account and sums per month', () => {
    const txns = [tx('a', '2026-06-10', 1000), tx('b', '2026-06-15', 2000), tx('a', '2026-07-10', 1200)]
    const points = monthlyBankTotal(txns)
    expect(points).toEqual([
      { month: '2026-06', bankTotal: 3000 },
      { month: '2026-07', bankTotal: 3200 },
    ])
  })

  it('returns an empty series when no balances are present', () => {
    expect(monthlyBankTotal([tx('a', '2026-06-10', null)])).toEqual([])
  })
})

describe('computeNetWorth', () => {
  it('adds assets, subtracts liabilities, and marks empty sources', () => {
    const summary = computeNetWorth({
      portfolioValue: 100000,
      bankBalances: [{ label: 'ICICI ••1234', balance: 50000 }],
      loanOutstanding: [{ label: 'Home loan ••1111', outstanding: 200000 }],
      cardDues: [],
    })
    expect(summary.totalAssets).toBe(150000)
    expect(summary.totalLiabilities).toBe(200000)
    expect(summary.netWorth).toBe(-50000)
    expect(summary.liabilityGroups.find((g) => g.key === 'cards')!.hasData).toBe(false)
    expect(summary.assetGroups.find((g) => g.key === 'bank')!.hasData).toBe(true)
  })

  it('handles every source being empty', () => {
    const summary = computeNetWorth({ portfolioValue: 0, bankBalances: [], loanOutstanding: [], cardDues: [] })
    expect(summary).toMatchObject({ totalAssets: 0, totalLiabilities: 0, netWorth: 0 })
    expect(summary.assetGroups.every((g) => !g.hasData)).toBe(true)
  })
})
