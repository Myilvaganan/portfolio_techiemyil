// Net worth = investments + bank balances - loans - credit card dues. Pure aggregation; each source can be
// missing (no statements uploaded yet) and the page degrades gracefully instead of erroring.

import type { Statement, Txn } from './statements'
import { monthOf } from './statements'

const round = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

const BANK_LABEL: Record<string, string> = { icici: 'ICICI', axis: 'Axis', other: 'Bank' }

export interface BankAccountBalance {
  accountKey: string
  label: string
  balance: number
  asOf: string
}

// Latest known balance per bank account: the last transaction that printed a running balance, falling back to
// the closing balance on the newest statement for that account.
export function bankAccountBalances(txns: Txn[], statements: Statement[]): BankAccountBalance[] {
  const keys = new Set<string>([...statements.map((s) => s.accountKey), ...txns.map((t) => t.accountKey)])
  const out: BankAccountBalance[] = []
  for (const key of keys) {
    const accTxns = [...txns.filter((t) => t.accountKey === key)].sort((a, b) => a.date.localeCompare(b.date))
    const lastWithBalance = [...accTxns].reverse().find((t) => typeof t.balance === 'number')
    const accStatements = statements.filter((s) => s.accountKey === key).sort((a, b) => (a.periodTo ?? '').localeCompare(b.periodTo ?? ''))
    const latestStatement = accStatements.at(-1)
    const balance = lastWithBalance?.balance ?? latestStatement?.closingBalance ?? null
    if (balance === null || balance === undefined) continue
    const bank = latestStatement?.bank ?? 'other'
    const last4 = latestStatement?.accountLast4
    out.push({
      accountKey: key,
      label: `${BANK_LABEL[bank] ?? 'Bank'}${last4 ? ` ••${last4}` : ''}`,
      balance,
      asOf: lastWithBalance?.date ?? latestStatement?.periodTo ?? '',
    })
  }
  return out.sort((a, b) => b.balance - a.balance)
}

// A month-by-month total across accounts, forward-filling each account's last known balance so a quiet month
// still contributes. Only produced when at least one account has a running balance in the statements.
export interface NetWorthPoint {
  month: string
  bankTotal: number
}

export function monthlyBankTotal(txns: Txn[]): NetWorthPoint[] {
  const byAccount = new Map<string, Map<string, number>>()
  for (const t of [...txns].sort((a, b) => a.date.localeCompare(b.date))) {
    if (typeof t.balance !== 'number') continue
    const perMonth = byAccount.get(t.accountKey) ?? new Map<string, number>()
    perMonth.set(monthOf(t.date), t.balance)
    byAccount.set(t.accountKey, perMonth)
  }
  if (byAccount.size === 0) return []
  const months = [...new Set(txns.map((t) => monthOf(t.date)))].sort()
  const lastKnown = new Map<string, number>()
  const out: NetWorthPoint[] = []
  for (const m of months) {
    for (const [account, perMonth] of byAccount) if (perMonth.has(m)) lastKnown.set(account, perMonth.get(m)!)
    if (lastKnown.size > 0) out.push({ month: m, bankTotal: round(sum([...lastKnown.values()])) })
  }
  return out
}

export interface NetWorthItem {
  key: string
  label: string
  value: number
}

export type NetWorthGroupKey = 'investments' | 'bank' | 'loans' | 'cards'

export interface NetWorthGroup {
  key: NetWorthGroupKey
  label: string
  items: NetWorthItem[]
  total: number
  hasData: boolean
}

export interface NetWorthInputs {
  portfolioValue: number
  bankBalances: { label: string; balance: number }[]
  loanOutstanding: { label: string; outstanding: number }[]
  cardDues: { label: string; due: number }[]
}

export interface NetWorthSummary {
  assetGroups: NetWorthGroup[]
  liabilityGroups: NetWorthGroup[]
  totalAssets: number
  totalLiabilities: number
  netWorth: number
}

export function computeNetWorth({ portfolioValue, bankBalances, loanOutstanding, cardDues }: NetWorthInputs): NetWorthSummary {
  const bankTotal = round(sum(bankBalances.map((b) => b.balance)))
  const loanTotal = round(sum(loanOutstanding.map((l) => l.outstanding)))
  const cardTotal = round(sum(cardDues.map((c) => c.due)))

  const assetGroups: NetWorthGroup[] = [
    { key: 'investments', label: 'Investments', items: portfolioValue > 0 ? [{ key: 'portfolio', label: 'Zerodha portfolio', value: portfolioValue }] : [], total: round(portfolioValue), hasData: portfolioValue > 0 },
    { key: 'bank', label: 'Bank balances', items: bankBalances.map((b, i) => ({ key: `${b.label}-${i}`, label: b.label, value: round(b.balance) })), total: bankTotal, hasData: bankBalances.length > 0 },
  ]
  const liabilityGroups: NetWorthGroup[] = [
    { key: 'loans', label: 'Loans', items: loanOutstanding.map((l, i) => ({ key: `${l.label}-${i}`, label: l.label, value: round(l.outstanding) })), total: loanTotal, hasData: loanOutstanding.length > 0 },
    { key: 'cards', label: 'Credit card dues', items: cardDues.filter((c) => c.due > 0).map((c, i) => ({ key: `${c.label}-${i}`, label: c.label, value: round(c.due) })), total: cardTotal, hasData: cardDues.length > 0 },
  ]

  const totalAssets = round(portfolioValue + bankTotal)
  const totalLiabilities = round(loanTotal + cardTotal)
  return { assetGroups, liabilityGroups, totalAssets, totalLiabilities, netWorth: round(totalAssets - totalLiabilities) }
}
