import { detectRecurring, type RecurringItem } from '../recurring'
import type { Txn } from '../statements'
import { isCardBillPayment } from '../budget'
import type { SubscriptionsDoc } from '../growthApi'

// Every repeating charge in one list: monthly subscriptions and EMIs (from the existing detector) plus yearly
// renewals such as insurance and domains. Adds the yearly cost, spots charges that have stopped, and applies the
// user's "cancelled" and "hide" choices.

export type Cadence = 'monthly' | 'yearly'
export type SubStatus = 'active' | 'stopped'

export interface Subscription extends RecurringItem {
  key: string
  cadence: Cadence
  yearlyCost: number
  status: SubStatus
  daysToDue: number
}

const DAY = 86_400_000
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)
export const subKey = (merchant: string) => merchant.trim().toLowerCase()

// Only bill-like categories: a grocer or a friend paid every month repeats too, but isn't a subscription.
export const SUBSCRIPTION_CATEGORIES = new Set(['Subscriptions', 'Bills & Utilities', 'Insurance', 'Rent', 'EMI & Loans', 'EMI', 'Fees & Charges', 'Education'])

/**
 * `asOf` is normally the latest statement date, not today: statements arrive in batches, and measuring against today
 * would make every charge look overdue until the next import.
 */
export function buildSubscriptions(allTxns: Txn[], doc: SubscriptionsDoc, asOf: string) {
  const today = asOf
  // Paying a card bill (directly or through CRED) repeats monthly but is not a subscription.
  const txns = allTxns.filter((t) => SUBSCRIPTION_CATEGORIES.has(t.category) && !isCardBillPayment(t) && !/\bcred\b/i.test(`${t.merchant} ${t.description}`))
  const monthly = detectRecurring(txns).map((r) => ({ r, cadence: 'monthly' as Cadence }))
  const seen = new Set(monthly.map((x) => subKey(x.r.merchant)))
  const yearly = detectRecurring(txns, { minOccurrences: 2, minIntervalDays: 330, maxIntervalDays: 400 })
    .filter((r) => !seen.has(subKey(r.merchant)))
    .map((r) => ({ r, cadence: 'yearly' as Cadence }))

  const ignored = new Set(doc.ignored)
  const cancelled = new Set(doc.cancelled.map((c) => c.key))

  const all: Subscription[] = [...monthly, ...yearly]
    .map(({ r, cadence }) => {
      const key = subKey(r.merchant)
      const perYear = 365 / Math.max(1, r.avgIntervalDays)
      // A charge more than twice its usual gap overdue has most likely stopped.
      const stopped = days(r.lastDate, today) > r.avgIntervalDays * 2
      return { ...r, key, cadence, yearlyCost: r.avgAmount * perYear, status: (stopped ? 'stopped' : 'active') as SubStatus, daysToDue: days(today, r.nextDueDate) }
    })
    .filter((s) => !ignored.has(s.key) && !cancelled.has(s.key))
    .sort((a, b) => (a.status === b.status ? a.nextDueDate.localeCompare(b.nextDueDate) : a.status === 'active' ? -1 : 1))

  const active = all.filter((s) => s.status === 'active')
  return {
    subscriptions: all,
    yearlyTotal: active.reduce((s, x) => s + x.yearlyCost, 0),
    monthlyTotal: active.reduce((s, x) => s + x.yearlyCost, 0) / 12,
    activeCount: active.length,
    priceRises: active.filter((s) => s.amountChanged && s.changePct > 0).length,
    dueSoon: active.filter((s) => s.daysToDue >= 0 && s.daysToDue <= 30),
    savedPerYear: doc.cancelled.reduce((s, c) => s + c.yearly, 0),
  }
}
