import { describe, expect, it } from 'vitest'
import {
  blankReport,
  changeOf,
  dailyDeficit,
  findings,
  fmtDelta,
  fmtMetric,
  goalProgress,
  healthReminder,
  historyReports,
  logAverages,
  normalizeReport,
  projectGoalDate,
  rangeOf,
  statusOf,
  type DailyLog,
  type Goal,
  type HealthReport,
} from './health'

// Illustrative numbers only.
function sample(over: Partial<HealthReport> = {}): HealthReport {
  const r = blankReport({ heightCm: 170, age: 30, sex: 'male' })
  r.id = 'r1'
  r.testedAt = '2026-09-01T08:00'
  r.values = { ...r.values, weight: 90, skeletalMuscleMass: 32, bodyFatMass: 30, percentBodyFat: 33.3, visceralFatLevel: 14, waistHipRatio: 1.0, fatControl: -18, muscleControl: 0, targetWeight: 70 }
  r.ranges = { bodyFatMass: { low: 8, high: 16 }, skeletalMuscleMass: { low: 28, high: 35 }, weight: { low: 55, high: 75 } }
  for (const s of ['leftArm', 'rightArm', 'trunk', 'leftLeg', 'rightLeg'] as const) r.segments.fat[s] = { kg: 3, eval: 'Over' }
  return { ...r, ...over }
}

describe('ranges and status', () => {
  it('prefers the sheet range and falls back to standard ones', () => {
    const r = sample()
    expect(rangeOf(r, 'weight')).toEqual({ low: 55, high: 75 })
    expect(rangeOf(r, 'percentBodyFat')).toEqual({ low: 10, high: 20 })
    expect(rangeOf({ ...r, profile: { ...r.profile, sex: 'female' } }, 'percentBodyFat')).toEqual({ low: 18, high: 28 })
    expect(rangeOf(r, 'protein')).toBeNull()
  })

  it('classifies a value against its range', () => {
    expect(statusOf(5, { low: 8, high: 16 })).toBe('under')
    expect(statusOf(16, { low: 8, high: 16 })).toBe('normal')
    expect(statusOf(17, { low: 8, high: 16 })).toBe('over')
    expect(statusOf(null, { low: 8, high: 16 })).toBeNull()
    expect(statusOf(5, null)).toBeNull()
  })
})

describe('formatting', () => {
  it('formats values and changes with units', () => {
    expect(fmtMetric('weight', 90)).toBe('90.0 kg')
    expect(fmtMetric('percentBodyFat', 33.33)).toBe('33.3%')
    expect(fmtMetric('visceralFatLevel', 14)).toBe('14')
    expect(fmtMetric('weight', null)).toBe('—')
    expect(fmtDelta('weight', -2.34)).toBe('−2.3 kg')
    expect(fmtDelta('percentBodyFat', 1.5)).toBe('+1.5 pts')
  })
})

describe('changeOf', () => {
  it('compares the last two reports that have the metric', () => {
    const a = sample({ id: 'a', testedAt: '2026-01-01' })
    const b = sample({ id: 'b', testedAt: '2026-03-01', values: { ...a.values, weight: null } })
    const c = sample({ id: 'c', testedAt: '2026-05-01', values: { ...a.values, weight: 87.5 } })
    expect(changeOf([c, a, b], 'weight')).toEqual({ delta: -2.5, since: '2026-01-01' })
    expect(changeOf([a], 'weight')).toBeNull()
  })
})

describe('findings', () => {
  it('flags excess fat, visceral fat, waist-hip ratio and the suggested change', () => {
    const titles = findings(sample()).map((f) => `${f.tone}:${f.title}`)
    expect(titles).toContain('bad:Body fat 33.3%')
    expect(titles).toContain('bad:Visceral fat level 14')
    expect(titles).toContain('warn:Waist-hip ratio 1.00')
    expect(titles).toContain('good:Muscle 32.0 kg')
    expect(titles).toContain('warn:Suggested change')
    expect(titles).toContain('warn:Fat is spread evenly')
    expect(findings(sample())[0].detail).toMatch(/14\.0 kg of fat above/)
  })

  it('reports good news when in range', () => {
    const r = sample()
    r.values = { ...r.values, percentBodyFat: 15, visceralFatLevel: 5, waistHipRatio: 0.85, fatControl: 0 }
    expect(findings(r).map((f) => f.tone)).toEqual(['good', 'good', 'warn'])
  })
})

describe('historyReports', () => {
  it('turns history columns into slim reports, skipping dates already stored', () => {
    const template = sample()
    const out = historyReports(
      [
        { date: '2025-06-01', weight: 88, skeletalMuscleMass: 33, percentBodyFat: 30 },
        { date: '2026-09-01', weight: 90, skeletalMuscleMass: 32, percentBodyFat: 33.3 },
      ],
      [template],
      template,
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ testedAt: '2025-06-01', source: 'history', id: '' })
    expect(out[0].values).toMatchObject({ weight: 88, bodyFatMass: 26.4, bmi: 30.4 })
    expect(out[0].ranges.weight).toEqual({ low: 55, high: 75 })
  })
})

describe('normalizeReport', () => {
  it('fills missing fields', () => {
    const r = normalizeReport({ id: 'x', testedAt: '2026-01-01', values: { weight: 80 } as HealthReport['values'] })
    expect(r.values.bmi).toBeNull()
    expect(r.segments.lean.trunk).toEqual({ kg: null, eval: '' })
    expect(r.profile.sex).toBe('')
  })
})

it('dailyDeficit spreads the fat over the weeks', () => {
  expect(dailyDeficit(10, 26)).toBe(423)
  expect(dailyDeficit(10, 0)).toBe(0)
})

const goal = (over: Partial<Goal> = {}): Goal => ({ weightKg: 75, bodyFatPct: null, targetDate: null, notes: '', updatedAt: 'x', ...over })

describe('goalProgress', () => {
  it('measures progress from the first test to the latest towards the target', () => {
    const a = sample({ id: 'a', testedAt: '2026-01-01', values: { ...sample().values, weight: 95 } })
    const b = sample({ id: 'b', testedAt: '2026-03-01', values: { ...sample().values, weight: 85 } })
    // start 95, current 85, target 75: halfway there.
    expect(goalProgress([a, b], goal(), 'weight')).toEqual({ metric: 'weight', start: 95, current: 85, target: 75, pct: 50 })
  })

  it('clamps and handles a start already at target', () => {
    const a = sample({ id: 'a', testedAt: '2026-01-01', values: { ...sample().values, weight: 95 } })
    const b = sample({ id: 'b', testedAt: '2026-03-01', values: { ...sample().values, weight: 60 } })
    expect(goalProgress([a, b], goal(), 'weight')!.pct).toBe(100)
    expect(goalProgress([a], goal({ weightKg: 95 }), 'weight')!.pct).toBe(100)
  })

  it('returns null with no target for that metric or no data', () => {
    expect(goalProgress([], goal(), 'weight')).toBeNull()
    expect(goalProgress([sample()], goal(), 'percentBodyFat')).toBeNull()
  })
})

describe('projectGoalDate', () => {
  it('projects forward when the trend moves toward the target', () => {
    const a = sample({ id: 'a', testedAt: '2026-01-01', values: { ...sample().values, weight: 100 } })
    const b = sample({ id: 'b', testedAt: '2026-01-11', values: { ...sample().values, weight: 98 } }) // -0.2 kg/day
    const p = projectGoalDate([a, b], 'weight', 90, new Date('2026-01-11T00:00:00Z'))
    expect(p.onTrack).toBe(true)
    expect(p.daysFromNow).toBe(40)
    expect(p.date).toBe('2026-02-20')
  })

  it('is not on track with fewer than two points', () => {
    expect(projectGoalDate([sample()], 'weight', 70).onTrack).toBe(false)
    expect(projectGoalDate([], 'weight', 70).date).toBeNull()
  })

  it('flags a trend moving the wrong way', () => {
    const a = sample({ id: 'a', testedAt: '2026-01-01', values: { ...sample().values, weight: 90 } })
    const b = sample({ id: 'b', testedAt: '2026-01-11', values: { ...sample().values, weight: 92 } }) // gaining, target is lower
    expect(projectGoalDate([a, b], 'weight', 80).onTrack).toBe(false)
  })
})

describe('healthReminder', () => {
  it('is due with no tests yet', () => {
    expect(healthReminder([], new Date('2026-09-26'))).toEqual({ daysSince: null, due: true })
  })

  it('flags a test older than the threshold', () => {
    const r = sample({ testedAt: '2026-08-01' })
    expect(healthReminder([r], new Date('2026-09-26'))).toEqual({ daysSince: 56, due: true })
    expect(healthReminder([r], new Date('2026-08-10'))).toEqual({ daysSince: 9, due: false })
  })
})

describe('logAverages', () => {
  const logs: DailyLog[] = [
    { date: '2026-09-20', weight: 90, steps: 8000, waterL: 2, sleepH: 7, note: '' },
    { date: '2026-09-24', weight: 89, steps: null, waterL: 3, sleepH: null, note: '' },
    { date: '2026-08-01', weight: 95, steps: 5000, waterL: 1, sleepH: 6, note: '' },
  ]

  it('averages only entries within the window and with a value', () => {
    const avg = logAverages(logs, 7, new Date('2026-09-26'))
    expect(avg.weight).toBe(89.5)
    expect(avg.steps).toBe(8000)
    expect(avg.waterL).toBe(2.5)
    expect(avg.sleepH).toBe(7)
  })

  it('returns null for a metric with no entries in range', () => {
    expect(logAverages([], 7, new Date('2026-09-26'))).toEqual({ weight: null, steps: null, waterL: null, sleepH: null })
  })
})
