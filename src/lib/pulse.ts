import { netInr, type JournalSettings, type Trade } from './journal'
import type { Loan } from './loans'
import type { HealthReport } from './health'
import type { ContactMessage } from './platformApi'

export const INBODY_EVERY_DAYS = 30
export const EMI_SOON_DAYS = 5

export interface Pulse {
  today: string
  todayPnl: number | null
  todayTrades: number
  monthPnl: number | null
  lossLimitHit: boolean
  nextEmi: { loan: string; date: string; amount: number; days: number } | null
  overdueEmis: number
  loansOutstanding: number | null
  latestWeight: { kg: number; date: string } | null
  inbodyDaysSince: number | null
  unreadMessages: number
  siteViews: number | null
  /** Ready-made notices from the money features (budgets, card dues, reminders, unusual spend). */
  extra: Notice[]
}

export interface PulseInput {
  today: string
  trades?: Trade[] | null
  settings?: JournalSettings | null
  loans?: Loan[] | null
  reports?: HealthReport[] | null
  messages?: ContactMessage[] | null
  siteViews?: number | null
  extra?: Notice[]
}

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** Everything the home screen and the notification bell show, from whatever sources loaded (a failed source is null). */
export function buildPulse({ today, trades, settings, loans, reports, messages, siteViews = null, extra = [] }: PulseInput): Pulse {
  const todays = trades ? trades.filter((t) => t.date === today) : null
  const todayPnl = todays ? todays.reduce((s, t) => s + netInr(t), 0) : null
  const monthPnl = trades ? trades.filter((t) => t.date.slice(0, 7) === today.slice(0, 7)).reduce((s, t) => s + netInr(t), 0) : null

  let nextEmi: Pulse['nextEmi'] = null
  let overdueEmis = 0
  for (const l of loans ?? []) {
    overdueEmis += l.schedule.filter((r) => r.status === 'overdue').length
    const due = l.schedule.find((r) => r.status !== 'paid' && r.date >= today)
    if (due && (!nextEmi || due.date < nextEmi.date)) nextEmi = { loan: l.label || l.short, date: due.date, amount: due.installment, days: days(today, due.date) }
  }

  const full = (reports ?? []).filter((r) => r.values.weight !== null).sort((a, b) => a.testedAt.localeCompare(b.testedAt))
  const last = full[full.length - 1]
  const latestWeight = last ? { kg: last.values.weight as number, date: last.testedAt.slice(0, 10) } : null

  return {
    today,
    todayPnl,
    todayTrades: todays?.length ?? 0,
    monthPnl,
    lossLimitHit: Boolean(settings && settings.dailyLossLimit > 0 && todayPnl !== null && todayPnl <= -settings.dailyLossLimit),
    nextEmi,
    overdueEmis,
    loansOutstanding: loans ? loans.reduce((s, l) => s + l.outstanding, 0) : null,
    latestWeight,
    inbodyDaysSince: latestWeight ? days(latestWeight.date, today) : null,
    unreadMessages: (messages ?? []).filter((m) => !m.read).length,
    siteViews,
    extra,
  }
}

export interface Notice {
  id: string
  tone: 'bad' | 'warn' | 'info'
  title: string
  detail: string
  to: string
}

export function noticesFrom(p: Pulse, fmt: (n: number) => string): Notice[] {
  const out: Notice[] = []
  if (p.lossLimitHit && p.todayPnl !== null) out.push({ id: 'loss', tone: 'bad', title: 'Daily loss limit reached', detail: `Today is ${fmt(p.todayPnl)} across ${p.todayTrades} trades. Stop for the day.`, to: '/admin/trading-journal' })
  if (p.overdueEmis > 0) out.push({ id: 'overdue', tone: 'bad', title: `${p.overdueEmis} overdue EMI${p.overdueEmis === 1 ? '' : 's'}`, detail: 'Pay now to avoid penalties and a credit-score hit.', to: '/admin/loans' })
  if (p.nextEmi && p.nextEmi.days <= EMI_SOON_DAYS) {
    out.push({ id: 'emi', tone: 'warn', title: p.nextEmi.days === 0 ? 'EMI due today' : `EMI due in ${p.nextEmi.days} day${p.nextEmi.days === 1 ? '' : 's'}`, detail: `${p.nextEmi.loan}: ${fmt(p.nextEmi.amount)} on ${p.nextEmi.date}.`, to: '/admin/loans' })
  }
  if (p.inbodyDaysSince !== null && p.inbodyDaysSince >= INBODY_EVERY_DAYS) out.push({ id: 'inbody', tone: 'info', title: 'Time for an InBody test', detail: `Your last test was ${p.inbodyDaysSince} days ago.`, to: '/admin/health-report' })
  if (p.unreadMessages > 0) out.push({ id: 'messages', tone: 'info', title: `${p.unreadMessages} new message${p.unreadMessages === 1 ? '' : 's'}`, detail: 'From the contact form on your website.', to: '/admin/site' })
  return [...out, ...p.extra]
}
