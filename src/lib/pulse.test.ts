import { describe, expect, it } from 'vitest'
import { blankTrade, DEFAULT_SETTINGS, type Trade } from './journal'
import { blankReport } from './health'
import type { Loan } from './loans'
import { buildPulse, noticesFrom } from './pulse'

const trade = (date: string, pnl: number): Trade => ({ ...blankTrade(date), grossPnl: pnl, fees: 0 })
const loan = (rows: { date: string; status: 'paid' | 'due' | 'overdue' | 'upcoming'; installment: number }[]) =>
  ({ label: 'Home loan', short: 'HL', outstanding: 100000, schedule: rows }) as unknown as Loan
const fmt = (n: number) => `₹${n}`

describe('buildPulse', () => {
  it('sums today and the month, and flags a breached daily loss limit', () => {
    const p = buildPulse({ today: '2026-09-26', trades: [trade('2026-09-26', -3000), trade('2026-09-26', 500), trade('2026-09-02', 1000)], settings: { ...DEFAULT_SETTINGS, dailyLossLimit: 2000 } })
    expect(p).toMatchObject({ todayPnl: -2500, todayTrades: 2, monthPnl: -1500, lossLimitHit: true })
    expect(noticesFrom(p, fmt)[0].id).toBe('loss')
  })

  it('finds the nearest upcoming EMI across loans and counts overdue ones', () => {
    const p = buildPulse({
      today: '2026-09-26',
      loans: [loan([{ date: '2026-09-05', status: 'overdue', installment: 9000 }, { date: '2026-10-05', status: 'upcoming', installment: 9000 }]), loan([{ date: '2026-09-28', status: 'upcoming', installment: 4000 }])],
    })
    expect(p.nextEmi).toEqual({ loan: 'Home loan', date: '2026-09-28', amount: 4000, days: 2 })
    expect(p.overdueEmis).toBe(1)
    expect(noticesFrom(p, fmt).map((n) => n.id)).toEqual(['overdue', 'emi'])
  })

  it('reminds about an InBody test after 30 days and reports unread messages', () => {
    const r = { ...blankReport(), id: 'a', testedAt: '2026-08-20T07:00', values: { ...blankReport().values, weight: 95 } }
    const p = buildPulse({ today: '2026-09-26', reports: [r], messages: [{ id: '1', name: 'A', email: 'a@b.c', message: 'hi', read: false, createdAt: '' }] })
    expect(p.latestWeight).toEqual({ kg: 95, date: '2026-08-20' })
    expect(p.inbodyDaysSince).toBe(37)
    expect(noticesFrom(p, fmt).map((n) => n.id)).toEqual(['inbody', 'messages'])
  })

  it('leaves unloaded sources empty instead of guessing', () => {
    const p = buildPulse({ today: '2026-09-26' })
    expect(p).toMatchObject({ todayPnl: null, monthPnl: null, nextEmi: null, loansOutstanding: null, latestWeight: null })
    expect(noticesFrom(p, fmt)).toEqual([])
  })
})
