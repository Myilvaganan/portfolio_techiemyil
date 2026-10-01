import { describe, expect, it } from 'vitest'
import { EMPTY_DOCS } from '../growthApi'
import { addWater, latestWeight, monthGrid, monthStats, waterStreak, waterTarget } from './water'

const doc = EMPTY_DOCS.water

describe('water', () => {
  it('works out the target from weight, activity and heat', () => {
    expect(waterTarget({ ...doc, weightKg: 80 }, null)?.target).toBe(3150)
    expect(waterTarget({ ...doc, weightKg: 80, activity: 'high', hot: true }, null)?.target).toBe(4000)
    expect(waterTarget({ ...doc, weightKg: 0 }, 40)?.target).toBe(1750)
    expect(waterTarget({ ...doc, weightKg: 200 }, null)?.target).toBe(5000)
    expect(waterTarget({ ...doc, customMl: 2500 }, 80)?.target).toBe(2500)
    expect(waterTarget(doc, null)).toBeNull()
  })

  it('takes the newest weight from the Health log', () => {
    expect(latestWeight([{ date: '2026-09-01', weight: 82 }, { date: '2026-09-20', weight: 80.5 }, { date: '2026-09-25', weight: null }] as never)).toEqual({ kg: 80.5, date: '2026-09-20' })
  })

  it('adds and undoes glasses without going negative', () => {
    let d = addWater(doc, '2026-10-01', 250)
    d = addWater(d, '2026-10-01', 500)
    expect(d.logs['2026-10-01']).toBe(750)
    expect(addWater(d, '2026-10-01', -1000).logs['2026-10-01']).toBeUndefined()
  })

  it('counts the streak and the month', () => {
    const d = { ...doc, logs: { '2026-09-29': 3000, '2026-09-30': 3200, '2026-10-01': 1000 } }
    expect(waterStreak(d, '2026-10-01', 3000)).toBe(2)
    expect(monthGrid('2026-10').slice(0, 4)).toEqual([null, null, null, '2026-10-01'])
    expect(monthStats(d, '2026-09', '2026-10-01', 3000)).toEqual({ days: 30, logged: 2, met: 2, avg: 3100 })
  })
})
