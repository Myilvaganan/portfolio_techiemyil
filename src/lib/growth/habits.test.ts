import { describe, expect, it } from 'vitest'
import type { Txn } from '../statements'
import { dayState, rate, streak, toggle } from './habits'

const walk = { id: 'walk1', name: 'Walk', auto: '' as const, target: 0 }
const food = { id: 'food1', name: 'No delivery', auto: 'no-delivery' as const, target: 0 }
const steps = { id: 'step1', name: '10k steps', auto: 'steps' as const, target: 10000 }
const swiggy = (date: string): Txn => ({ id: date, statementId: 's', accountKey: 'a', date, description: 'SWIGGY', merchant: 'Swiggy', debit: 400, credit: 0, category: 'Food & Dining' })
const auto = { txns: [swiggy('2026-09-26')], statementsTo: '2026-09-27', health: [{ date: '2026-09-28', steps: 12000, sleepH: null, weight: null, waterL: null, note: '' }], breachDays: new Set<string>() }

describe('habits', () => {
  const doc = { habits: [walk, food, steps], checks: { '2026-09-27': ['walk1'], '2026-09-28': ['walk1'], '2026-09-26': ['walk1'] } }

  it('reads manual ticks and automatic data, with unknown where data is missing', () => {
    expect(dayState(walk, '2026-09-28', doc, auto)).toBe('done')
    expect(dayState(walk, '2026-09-25', doc, auto)).toBe('missed')
    expect(dayState(food, '2026-09-26', doc, auto)).toBe('missed')
    expect(dayState(food, '2026-09-27', doc, auto)).toBe('done')
    expect(dayState(food, '2026-09-29', doc, auto)).toBe('unknown')
    expect(dayState(steps, '2026-09-28', doc, auto)).toBe('done')
    expect(dayState(steps, '2026-09-27', doc, auto)).toBe('unknown')
  })

  it('counts a streak through yesterday when today is not ticked yet', () => {
    expect(streak(walk, '2026-09-29', doc, auto)).toBe(3)
    expect(streak(food, '2026-09-29', doc, auto)).toBe(1)
  })

  it('works out the rate over known days only, and toggles ticks', () => {
    expect(rate(steps, ['2026-09-27', '2026-09-28'], doc, auto)).toBe(100)
    const off = toggle(doc, 'walk1', '2026-09-28')
    expect(off.checks['2026-09-28']).toBeUndefined()
    expect(toggle(off, 'walk1', '2026-09-28').checks['2026-09-28']).toEqual(['walk1'])
  })
})
