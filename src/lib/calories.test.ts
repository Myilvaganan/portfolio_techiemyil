import { describe, expect, it } from 'vitest'
import { dayTotals, insights, logStreak, targets } from './calories'
import type { FoodEntry } from './growthApi'

const p = { sex: 'male' as const, age: 33, heightCm: 175, weightKg: 80, activity: 'light' as const, goal: 'lose' as const, customKcal: 0 }
const e = (date: string, meal: FoodEntry['meal'], kcal: number, protein = 10): FoodEntry => ({ id: date + meal + kcal, date, meal, name: 'x', qty: '', kcal, protein, carbs: 0, fat: 0, fiber: 5 })

describe('calories', () => {
  it('works out targets with Mifflin–St Jeor', () => {
    const t = targets(p, 0)!
    expect(t.bmr).toBe(1734)
    expect(t.kcal).toBe(1880)
    expect(t.protein).toBe(160)
  })
  it('totals a day by meal and counts the logging streak', () => {
    const entries = [e('2026-10-01', 'lunch', 600), e('2026-10-01', 'snack', 200), e('2026-09-30', 'dinner', 700)]
    expect(dayTotals(entries, '2026-10-01')).toMatchObject({ kcal: 800, byMeal: { lunch: 600, snack: 200 } })
    expect(logStreak(entries, '2026-10-01')).toBe(2)
  })
  it('flags low protein and overeating', () => {
    const days = ['2026-09-29', '2026-09-30', '2026-10-01']
    const entries = days.map((d) => e(d, 'lunch', 2600, 50))
    const text = insights(entries, days, targets(p, 0)).map((i) => i.text).join(' ')
    expect(text).toContain('over your 1880 target')
    expect(text).toContain('Protein is low')
  })
})
