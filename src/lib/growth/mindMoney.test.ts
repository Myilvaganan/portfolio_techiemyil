import { describe, expect, it } from 'vitest'
import { blankTrade } from '../journal'
import type { Txn } from '../statements'
import { buildMindMoney } from './mindMoney'

const log = (date: string, sleepH: number | null, steps: number | null = null) => ({ date, sleepH, steps, weight: null, waterL: null, note: '' })
const shop = (date: string, debit: number): Txn => ({ id: date + debit, statementId: 's', accountKey: 'a', date, description: 'AMAZON', merchant: 'Amazon', debit, credit: 0, category: 'Shopping' })

describe('buildMindMoney', () => {
  const logs = [log('2026-09-01', 5), log('2026-09-02', 5.5), log('2026-09-03', 8, 12000), log('2026-09-04', null, 3000)]
  const trades = [
    { ...blankTrade('2026-09-01'), grossPnl: -3000 },
    { ...blankTrade('2026-09-02'), grossPnl: 1000 },
    { ...blankTrade('2026-09-03'), grossPnl: 4000 },
  ]
  const r = buildMindMoney({ logs, trades, txns: [shop('2026-09-01', 2000)], tags: {}, breachDays: new Set(['2026-09-01']) })

  it('groups days by sleep and compares trading on them', () => {
    const short = r.sleep.find((b) => b.key === 'under6')!
    expect(short).toMatchObject({ days: 2, tradingDays: 2, avgPnl: -1000, winDayPct: 50, breachDayPct: 50, avgWants: 1000, enough: false })
    expect(r.sleep.find((b) => b.key === '7plus')).toMatchObject({ days: 1, avgPnl: 4000, winDayPct: 100 })
  })

  it('groups days by steps, skipping days without that measure', () => {
    expect(r.steps.find((b) => b.key === '10kplus')!.days).toBe(1)
    expect(r.steps.find((b) => b.key === 'under5k')).toMatchObject({ days: 1, tradingDays: 0, avgPnl: null })
    expect(r.loggedDays).toBe(4)
  })
})
