import { describe, expect, it } from 'vitest'
import { gateAdvice } from './gate'
import { DEFAULT_SETTINGS, type Trade } from './journal'

const day = { sleep: 4, mood: 4, rulesRead: true, plan: '', checks: [0, 1] }
const t = (date: string, grossPnl: number) => ({ date, grossPnl, fees: 0, currency: 'INR' }) as unknown as Trade

describe('trading gate', () => {
  it('allows full size when rested, calm and prepared', () => {
    expect(gateAdvice({ day, today: '2026-10-01', trades: [], settings: DEFAULT_SETTINGS, checklistLength: 2 }).size).toBe('full')
  })
  it('halves after a three-day losing streak and skips on no sleep', () => {
    const trades = [t('2026-09-28', -100), t('2026-09-29', -200), t('2026-09-30', -50)]
    expect(gateAdvice({ day, today: '2026-10-01', trades, settings: DEFAULT_SETTINGS, checklistLength: 2 }).size).toBe('half')
    expect(gateAdvice({ day: { ...day, sleep: 1 }, today: '2026-10-01', trades: [], settings: DEFAULT_SETTINGS, checklistLength: 2 }).size).toBe('skip')
  })
  it('is not ready until the checklist is done', () => {
    const a = gateAdvice({ day: { ...day, checks: [0] }, today: '2026-10-01', trades: [], settings: DEFAULT_SETTINGS, checklistLength: 2 })
    expect(a.ready).toBe(false)
    expect(a.size).toBe('half')
  })
})
