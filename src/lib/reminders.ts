// Dated reminders: insurance renewals predicted from yearly premium debits, the ITR due date, advance-tax
// instalments and your own. FD/RD maturities are not in bank statements (a booking debit carries no tenure),
// so those are added as custom reminders.

import type { Txn } from './statements'

export type ReminderKind = 'insurance' | 'itr' | 'advance-tax' | 'custom'

export interface Reminder {
  id: string
  title: string
  detail: string
  date: string
  kind: ReminderKind
}

export interface CustomReminder {
  id: string
  title: string
  date: string
  note?: string
}

const DAY_MS = 86_400_000
const INSURANCE = /insurance|\blic\b|life insurance|hdfc life|sbi life|max life|icici pru\w* life|tata aia|bajaj allianz|star health|care health|niva bupa|max bupa|hdfc ergo|new india assurance|acko|digit insur|policybazaar|policy premium/
const pad = (n: number) => String(n).padStart(2, '0')
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)
const addYears = (d: string, n: number) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`
const dateLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export function insuranceRenewals(txns: Txn[], today: string): Reminder[] {
  const groups = new Map<string, Txn[]>()
  for (const t of txns) {
    if (!(t.debit >= 1000)) continue
    const text = `${t.merchant} ${t.description}`.toLowerCase()
    if (!(t.category === 'Insurance' || INSURANCE.test(text))) continue
    const key = (t.merchant || t.description).trim().toLowerCase().replace(/[\d\s]+/g, ' ').slice(0, 30)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  const out: Reminder[] = []
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
    // Several debits within a year means monthly premiums (or an EMI), which need no renewal date.
    const monthly = sorted.some((t, i) => i > 0 && daysBetween(sorted[i - 1].date, t.date) < 300)
    if (monthly) continue
    const last = sorted.at(-1)!
    let next = addYears(last.date, 1)
    let guard = 0
    while (daysBetween(today, next) < -30 && guard++ < 10) next = addYears(next, 1)
    out.push({
      id: `ins-${key.replace(/\W+/g, '-')}`,
      title: `Insurance renewal: ${(last.merchant || last.description).trim().slice(0, 40)}`,
      detail: `Last paid ${dateLabel(last.date)} (₹${Math.round(last.debit).toLocaleString('en-IN')}); expected around ${dateLabel(next)}`,
      date: next,
      kind: 'insurance',
    })
  }
  return out
}

/** The next occurrence on or after today of a fixed day and month. */
function nextOn(today: string, month: number, day: number) {
  const y = Number(today.slice(0, 4))
  const this_ = `${y}-${pad(month)}-${pad(day)}`
  return this_ >= today ? this_ : `${y + 1}-${pad(month)}-${pad(day)}`
}

export function taxReminders(today: string): Reminder[] {
  const itr = nextOn(today, 7, 31)
  const fyStart = Number(itr.slice(0, 4)) - 1
  const out: Reminder[] = [{ id: `itr-${itr}`, title: 'ITR due date', detail: `File for FY ${fyStart - 1}-${String(fyStart).slice(2)} by ${dateLabel(itr)} to avoid a late fee`, date: itr, kind: 'itr' }]
  const slots: [number, number, string][] = [[6, 15, '15% of the year’s tax'], [9, 15, '45% cumulative'], [12, 15, '75% cumulative'], [3, 15, '100% cumulative']]
  for (const [m, d, share] of slots) {
    const date = nextOn(today, m, d)
    out.push({ id: `adv-${date}`, title: 'Advance-tax instalment', detail: `Due ${dateLabel(date)}: ${share} (only if your tax is above ₹10,000 after TDS)`, date, kind: 'advance-tax' })
  }
  return out
}

export function buildReminders(txns: Txn[], today: string, custom: CustomReminder[] = []): Reminder[] {
  const own: Reminder[] = custom.map((c) => ({ id: `c-${c.id}`, title: c.title, detail: c.note ? `${c.note} · ${dateLabel(c.date)}` : dateLabel(c.date), date: c.date, kind: 'custom' }))
  return [...own, ...insuranceRenewals(txns, today), ...taxReminders(today)].sort((a, b) => a.date.localeCompare(b.date))
}

/** For the notification bell: reminders due today or within the next `withinDays` days. */
export function dueReminders(reminders: Reminder[], today: string, withinDays: number): { id: string; title: string; detail: string }[] {
  return reminders
    .map((r) => ({ r, d: daysBetween(today, r.date) }))
    .filter(({ d }) => d >= 0 && d <= withinDays)
    .sort((a, b) => a.d - b.d)
    .map(({ r, d }) => ({ id: r.id, title: r.title, detail: `${d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`} · ${r.detail}` }))
}
