import { useCallback, useEffect, useState } from 'react'
import { ALL_ACCOUNTS, monthOf, todayStr } from '@/lib/journal'
import { fetchJournal, fetchSettings } from '@/lib/journalStore'
import { fetchUsdInr } from '@/lib/livePrices'
import { FALLBACK_USD_INR } from '@/lib/margin'
import { buildLoans } from '@/lib/loans'
import { fetchLoanDocs } from '@/lib/statementsApi'
import { fetchReports } from '@/lib/healthApi'
import { fetchAnalytics, fetchMessages } from '@/lib/platformApi'
import { buildPulse, type Notice, type Pulse } from '@/lib/pulse'
import { fetchInbox, fetchStatements } from '@/lib/statementsApi'
import { fetchFinance } from '@/lib/financeApi'
import { fetchReminders } from '@/lib/investApi'
import { fetchLending } from '@/lib/lendingApi'
import { lendingNotices } from '@/lib/lending'
import { applyRules } from '@/lib/rules'
import { budgetNotices } from '@/lib/budget'
import { spendAlerts } from '@/lib/anomalies'
import { buildCardDues, cardDueNotices } from '@/lib/cardDues'
import { buildReminders, dueReminders } from '@/lib/reminders'

const TTL_MS = 60_000
let cache: { at: number; promise: Promise<Pulse> } | null = null

const settle = <T,>(p: Promise<T>) => p.catch(() => null)

/** Warnings from the money features. Any source that fails to load is skipped rather than blocking the rest. */
async function moneyNotices(today: string): Promise<Notice[]> {
  const [bank, card, settings, custom, inbox, lending] = await Promise.all([
    settle(fetchStatements('bank')),
    settle(fetchStatements('card')),
    settle(fetchFinance()),
    settle(fetchReminders()),
    settle(fetchInbox()),
    settle(fetchLending()),
  ])
  const out: Notice[] = []
  const rules = settings?.rules ?? []
  const bankTxns = bank ? applyRules(bank.transactions, rules) : []
  const cardTxns = card ? applyRules(card.transactions, rules) : []
  const all = [...bankTxns, ...cardTxns]
  if (settings && all.length) for (const n of budgetNotices(settings.budgets, all, today, settings.tags)) out.push({ ...n, tone: 'warn', to: '/admin/budgets' })
  if (card) for (const n of cardDueNotices(buildCardDues(card.transactions, card.statements, today), today)) out.push({ ...n, tone: 'warn', to: '/admin/credit-cards' })
  for (const n of dueReminders(buildReminders(bankTxns, today, custom ?? []), today, 14)) out.push({ ...n, tone: 'info', to: '/admin/investments' })
  for (const n of spendAlerts(all, today).slice(0, 3)) out.push({ ...n, tone: 'info', to: '/admin/budgets' })
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
  for (const n of lendingNotices(lending ?? [], today, inr)) out.push({ ...n, tone: 'warn', to: '/admin/lending' })
  const waiting = (inbox?.items ?? []).filter((i) => ['new', 'ready', 'failed'].includes(i.status))
  if (waiting.length) {
    const to = { bank: '/admin/bank-statements', card: '/admin/credit-cards', loan: '/admin/loans' }[waiting[0].kind ?? waiting[0].guess] ?? '/admin/bank-statements'
    out.push({ id: `inbox-${waiting.length}`, tone: 'info', title: `${waiting.length} statement${waiting.length === 1 ? '' : 's'} arrived by email`, detail: 'Open the page to read them into your accounts.', to })
  }
  return out
}

async function load(): Promise<Pulse> {
  const today = todayStr()
  const month = monthOf(today)
  const [journal, settings, usdInr, loanDocs, reports, messages, analytics, extra] = await Promise.all([
    settle(fetchJournal(month, month, ALL_ACCOUNTS)),
    settle(fetchSettings()),
    settle(fetchUsdInr()),
    settle(fetchLoanDocs()),
    settle(fetchReports()),
    settle(fetchMessages()),
    settle(fetchAnalytics(month)),
    settle(moneyNotices(today)),
  ])
  const rate = usdInr || FALLBACK_USD_INR
  // Forex (MT5) trades are in dollars; the home screen adds everything up in rupees.
  const trades = journal ? journal.trades.map((t) => (t.account ? { ...t, fxRate: rate } : t)) : null
  return buildPulse({
    today,
    trades,
    settings,
    loans: loanDocs ? buildLoans(loanDocs.statements, today) : null,
    reports,
    messages,
    siteViews: analytics ? analytics.total : null,
    extra: extra ?? [],
  })
}

/** Today's numbers from every part of the admin (journal, loans, health, website), shared by the home screen and the bell. */
export function useAdminPulse() {
  const [pulse, setPulse] = useState<Pulse | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!cache || Date.now() - cache.at > TTL_MS) cache = { at: Date.now(), promise: load() }
    cache.promise.then((p) => !cancelled && setPulse(p))
    return () => {
      cancelled = true
    }
  }, [tick])

  const refresh = useCallback(() => {
    cache = null
    setTick((n) => n + 1)
  }, [])

  return { pulse, refresh }
}
