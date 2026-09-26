// InBody body-composition reports: the data model, normal ranges and the plain-language reading of a result.

export type MetricKey =
  | 'weight'
  | 'totalBodyWater'
  | 'protein'
  | 'minerals'
  | 'bodyFatMass'
  | 'skeletalMuscleMass'
  | 'fatFreeMass'
  | 'bmi'
  | 'percentBodyFat'
  | 'waistHipRatio'
  | 'visceralFatLevel'
  | 'basalMetabolicRate'
  | 'obesityDegree'
  | 'smi'
  | 'inbodyScore'
  | 'targetWeight'
  | 'weightControl'
  | 'fatControl'
  | 'muscleControl'
  | 'recommendedCalories'

export type SegmentKey = 'rightArm' | 'leftArm' | 'trunk' | 'rightLeg' | 'leftLeg'
export type SegmentEval = '' | 'Under' | 'Normal' | 'Over'
export type Sex = '' | 'male' | 'female'
export type Status = 'under' | 'normal' | 'over'

export interface Range {
  low: number
  high: number
}

export interface Segment {
  kg: number | null
  eval: SegmentEval
}

export interface HealthReport {
  id: string
  /** YYYY-MM-DD or YYYY-MM-DDTHH:mm */
  testedAt: string
  device: string
  profile: { heightCm: number | null; age: number | null; sex: Sex }
  values: Record<MetricKey, number | null>
  /** The normal ranges printed on the sheet; missing ones fall back to DEFAULT_RANGES. */
  ranges: Partial<Record<MetricKey, Range>>
  segments: { lean: Record<SegmentKey, Segment>; fat: Record<SegmentKey, Segment> }
  notes: string
  source: 'manual' | 'scan' | 'history'
  createdAt: string
  updatedAt: string
}

/** Earlier tests listed in a sheet's "Body Composition History" table. */
export interface HistoryPoint {
  date: string
  weight: number | null
  skeletalMuscleMass: number | null
  percentBodyFat: number | null
}

export interface Goal {
  weightKg: number | null
  bodyFatPct: number | null
  /** YYYY-MM-DD */
  targetDate: string | null
  notes: string
  updatedAt: string
}

export interface DailyLog {
  /** YYYY-MM-DD */
  date: string
  weight: number | null
  steps: number | null
  waterL: number | null
  sleepH: number | null
  note: string
}

export interface MetricDef {
  key: MetricKey
  label: string
  unit: string
  decimals: number
  /** Metrics with a normal range (shown as a range bar). */
  ranged?: boolean
  hint?: string
}

// Keep the keys in sync with METRICS in lambda/admin-vault/health.js.
export const METRICS: MetricDef[] = [
  { key: 'weight', label: 'Weight', unit: 'kg', decimals: 1, ranged: true },
  { key: 'skeletalMuscleMass', label: 'Skeletal muscle mass', unit: 'kg', decimals: 1, ranged: true, hint: 'SMM' },
  { key: 'bodyFatMass', label: 'Body fat mass', unit: 'kg', decimals: 1, ranged: true },
  { key: 'percentBodyFat', label: 'Body fat', unit: '%', decimals: 1, ranged: true, hint: 'PBF' },
  { key: 'bmi', label: 'BMI', unit: 'kg/m²', decimals: 1, ranged: true },
  { key: 'visceralFatLevel', label: 'Visceral fat level', unit: '', decimals: 0, ranged: true },
  { key: 'waistHipRatio', label: 'Waist-hip ratio', unit: '', decimals: 2, ranged: true },
  { key: 'totalBodyWater', label: 'Total body water', unit: 'L', decimals: 1, ranged: true },
  { key: 'protein', label: 'Protein', unit: 'kg', decimals: 1, ranged: true },
  { key: 'minerals', label: 'Minerals', unit: 'kg', decimals: 2, ranged: true },
  { key: 'fatFreeMass', label: 'Fat-free mass', unit: 'kg', decimals: 1, ranged: true },
  { key: 'basalMetabolicRate', label: 'Basal metabolic rate', unit: 'kcal', decimals: 0, ranged: true, hint: 'BMR' },
  { key: 'obesityDegree', label: 'Obesity degree', unit: '%', decimals: 0, ranged: true },
  { key: 'smi', label: 'Skeletal muscle index', unit: 'kg/m²', decimals: 1, hint: 'SMI' },
  { key: 'inbodyScore', label: 'InBody score', unit: '/100', decimals: 0 },
  { key: 'targetWeight', label: 'Target weight', unit: 'kg', decimals: 1 },
  { key: 'weightControl', label: 'Weight control', unit: 'kg', decimals: 1 },
  { key: 'fatControl', label: 'Fat control', unit: 'kg', decimals: 1 },
  { key: 'muscleControl', label: 'Muscle control', unit: 'kg', decimals: 1 },
  { key: 'recommendedCalories', label: 'Recommended intake', unit: 'kcal', decimals: 0 },
]

export const METRIC: Record<MetricKey, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<MetricKey, MetricDef>

export const SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: 'leftArm', label: 'Left arm' },
  { key: 'rightArm', label: 'Right arm' },
  { key: 'trunk', label: 'Trunk' },
  { key: 'leftLeg', label: 'Left leg' },
  { key: 'rightLeg', label: 'Right leg' },
]

/**
 * Standard ranges for the metrics whose normal band doesn't depend on height, used when a report doesn't carry its
 * own (InBody prints weight, water, protein etc. ranges personalised to height and sex, so those have no fallback).
 */
export function defaultRange(key: MetricKey, sex: Sex): Range | null {
  switch (key) {
    case 'bmi':
      return { low: 18.5, high: 25 }
    case 'percentBodyFat':
      return sex === 'female' ? { low: 18, high: 28 } : { low: 10, high: 20 }
    case 'waistHipRatio':
      return sex === 'female' ? { low: 0.75, high: 0.85 } : { low: 0.8, high: 0.9 }
    case 'visceralFatLevel':
      return { low: 1, high: 9 }
    case 'obesityDegree':
      return { low: 90, high: 110 }
    default:
      return null
  }
}

export const rangeOf = (r: HealthReport, key: MetricKey): Range | null => r.ranges[key] ?? defaultRange(key, r.profile.sex)

export function statusOf(value: number | null, range: Range | null): Status | null {
  if (value === null || !range) return null
  if (value < range.low) return 'under'
  if (value > range.high) return 'over'
  return 'normal'
}

export const reportDate = (r: HealthReport) => r.testedAt.slice(0, 10)

export function fmtMetric(key: MetricKey, value: number | null, withUnit = true): string {
  if (value === null || value === undefined) return '—'
  const m = METRIC[key]
  const n = value.toLocaleString('en-IN', { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals })
  if (!withUnit || !m.unit) return n
  return m.unit === '%' || m.unit === '/100' ? `${n}${m.unit}` : `${n} ${m.unit}`
}

export function fmtDelta(key: MetricKey, delta: number): string {
  const d = METRIC[key].decimals
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±'
  return `${sign}${Math.abs(delta).toFixed(d)}${METRIC[key].unit === '%' ? ' pts' : METRIC[key].unit ? ` ${METRIC[key].unit}` : ''}`
}

export const sortReports = (reports: HealthReport[]) => [...reports].sort((a, b) => a.testedAt.localeCompare(b.testedAt))

/** Change in a metric from the previous report that has it to the latest one that has it. */
export function changeOf(reports: HealthReport[], key: MetricKey): { delta: number; since: string } | null {
  const withValue = sortReports(reports).filter((r) => r.values[key] !== null)
  if (withValue.length < 2) return null
  const last = withValue[withValue.length - 1]
  const prev = withValue[withValue.length - 2]
  return { delta: (last.values[key] as number) - (prev.values[key] as number), since: reportDate(prev) }
}

/** Whether going up is good news for a metric — drives the colour of a change. */
export function upIsGood(key: MetricKey): boolean | null {
  if (['skeletalMuscleMass', 'protein', 'minerals', 'fatFreeMass', 'smi', 'inbodyScore', 'basalMetabolicRate', 'totalBodyWater'].includes(key)) return true
  if (['bodyFatMass', 'percentBodyFat', 'visceralFatLevel', 'waistHipRatio'].includes(key)) return false
  return null
}

export function emptyValues(): Record<MetricKey, number | null> {
  return Object.fromEntries(METRICS.map((m) => [m.key, null])) as Record<MetricKey, number | null>
}

function emptySegments(): Record<SegmentKey, Segment> {
  return Object.fromEntries(SEGMENTS.map((s) => [s.key, { kg: null, eval: '' as SegmentEval }])) as Record<SegmentKey, Segment>
}

export function blankReport(profile?: HealthReport['profile']): HealthReport {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  return {
    id: '',
    testedAt: local,
    device: '',
    profile: profile ?? { heightCm: null, age: null, sex: '' },
    values: emptyValues(),
    ranges: {},
    segments: { lean: emptySegments(), fat: emptySegments() },
    notes: '',
    source: 'manual',
    createdAt: '',
    updatedAt: '',
  }
}

/** Fills any fields a stored or scanned report is missing, so the UI can rely on the full shape. */
export function normalizeReport(r: Partial<HealthReport>): HealthReport {
  const base = blankReport()
  return {
    ...base,
    ...r,
    profile: { ...base.profile, ...r.profile },
    values: { ...base.values, ...r.values },
    ranges: { ...r.ranges },
    segments: {
      lean: { ...base.segments.lean, ...r.segments?.lean },
      fat: { ...base.segments.fat, ...r.segments?.fat },
    },
  } as HealthReport
}

/**
 * Earlier tests from a sheet's history table become reports of their own (weight, SMM and PBF only), skipping any
 * date that already has a report.
 */
export function historyReports(history: HistoryPoint[], existing: HealthReport[], template: HealthReport): HealthReport[] {
  const taken = new Set(existing.map(reportDate))
  return history
    .filter((h) => !taken.has(h.date))
    .map((h) => {
      const r = blankReport(template.profile)
      r.testedAt = h.date
      r.device = template.device
      r.source = 'history'
      r.values.weight = h.weight
      r.values.skeletalMuscleMass = h.skeletalMuscleMass
      r.values.percentBodyFat = h.percentBodyFat
      if (h.weight !== null && h.percentBodyFat !== null) {
        r.values.bodyFatMass = Math.round(h.weight * h.percentBodyFat) / 100
      }
      if (template.profile.heightCm && h.weight !== null) {
        const m = template.profile.heightCm / 100
        r.values.bmi = Math.round((h.weight / (m * m)) * 10) / 10
      }
      // Ranges that depend only on height and sex carry over from the current sheet.
      for (const k of ['weight', 'percentBodyFat', 'bmi'] as MetricKey[]) if (template.ranges[k]) r.ranges[k] = template.ranges[k]
      return r
    })
}

export interface Finding {
  tone: 'good' | 'warn' | 'bad'
  title: string
  detail: string
}

/** A short, plain-language reading of one report. Descriptive only — not medical advice. */
export function findings(r: HealthReport): Finding[] {
  const v = r.values
  const out: Finding[] = []

  const pbf = statusOf(v.percentBodyFat, rangeOf(r, 'percentBodyFat'))
  const smm = statusOf(v.skeletalMuscleMass, rangeOf(r, 'skeletalMuscleMass'))
  const fatRange = rangeOf(r, 'bodyFatMass')

  if (pbf === 'over' && v.bodyFatMass !== null) {
    const excess = fatRange ? v.bodyFatMass - fatRange.high : null
    out.push({
      tone: 'bad',
      title: `Body fat ${fmtMetric('percentBodyFat', v.percentBodyFat)}`,
      detail: excess !== null && excess > 0 ? `About ${excess.toFixed(1)} kg of fat above the top of your normal range (${fmtMetric('bodyFatMass', fatRange!.high)}).` : 'Above the normal range for your sex.',
    })
  } else if (pbf === 'normal') {
    out.push({ tone: 'good', title: `Body fat ${fmtMetric('percentBodyFat', v.percentBodyFat)}`, detail: 'Within the normal range.' })
  }

  if (v.visceralFatLevel !== null) {
    const high = v.visceralFatLevel >= 10
    out.push({
      tone: high ? 'bad' : 'good',
      title: `Visceral fat level ${v.visceralFatLevel}`,
      detail: high ? 'Level 10 or more is flagged as high — this is the fat around the organs, and the one most worth bringing down.' : 'Below 10, the healthy band.',
    })
  }

  if (smm === 'under') out.push({ tone: 'warn', title: 'Muscle below range', detail: 'Skeletal muscle is under the normal range — strength training and enough protein would help.' })
  else if (v.skeletalMuscleMass !== null && pbf === 'over' && smm !== 'over') {
    out.push({ tone: 'good', title: `Muscle ${fmtMetric('skeletalMuscleMass', v.skeletalMuscleMass)}`, detail: 'Muscle is holding up; the aim is to lose fat while keeping it.' })
  }

  if (v.waistHipRatio !== null) {
    const s = statusOf(v.waistHipRatio, rangeOf(r, 'waistHipRatio'))
    if (s === 'over') out.push({ tone: 'warn', title: `Waist-hip ratio ${fmtMetric('waistHipRatio', v.waistHipRatio)}`, detail: `Above the normal band (${rangeOf(r, 'waistHipRatio')!.high.toFixed(2)}), pointing to fat stored around the middle.` })
  }

  if (v.fatControl !== null && v.fatControl < 0) {
    const muscle = v.muscleControl && v.muscleControl > 0 ? ` and gain ${fmtMetric('muscleControl', v.muscleControl)} of muscle` : ''
    out.push({
      tone: 'warn',
      title: 'Suggested change',
      detail: `The sheet suggests losing ${fmtMetric('fatControl', Math.abs(v.fatControl))} of fat${muscle}${v.targetWeight !== null ? `, for a target weight of ${fmtMetric('targetWeight', v.targetWeight)}` : ''}.`,
    })
  }

  const fatSegs = SEGMENTS.filter((s) => r.segments.fat[s.key].eval === 'Over')
  if (fatSegs.length === SEGMENTS.length) out.push({ tone: 'warn', title: 'Fat is spread evenly', detail: 'Every segment reads Over — no single area stands out, so overall fat loss is the lever.' })

  const leanLeft = r.segments.lean.leftArm.kg
  const leanRight = r.segments.lean.rightArm.kg
  if (leanLeft !== null && leanRight !== null && Math.max(leanLeft, leanRight) > 0) {
    const gap = Math.abs(leanLeft - leanRight) / Math.max(leanLeft, leanRight)
    if (gap > 0.1) out.push({ tone: 'warn', title: 'Arm imbalance', detail: `Your arms differ by ${(gap * 100).toFixed(0)}% in lean mass.` })
  }

  return out
}

/** Energy balance hint: the daily deficit needed to reach the fat-control target in a given number of weeks. */
export function dailyDeficit(fatKg: number, weeks: number): number {
  // ~7,700 kcal per kg of body fat.
  return weeks > 0 ? Math.round((fatKg * 7700) / (weeks * 7)) : 0
}

// ---------- Goal tracking ----------

export type GoalMetric = 'weight' | 'percentBodyFat'

export interface GoalProgress {
  metric: GoalMetric
  start: number
  current: number
  target: number
  /** 0-100, clamped. How far from the first test to the target the latest test has come. */
  pct: number
}

const goalTarget = (goal: Goal, metric: GoalMetric): number | null => (metric === 'weight' ? goal.weightKg : goal.bodyFatPct)

/** Progress from the first test that has this metric to the latest one, towards the goal's target. */
export function goalProgress(reports: HealthReport[], goal: Goal, metric: GoalMetric): GoalProgress | null {
  const target = goalTarget(goal, metric)
  if (target === null) return null
  const points = sortReports(reports).filter((r) => r.values[metric] !== null)
  if (points.length === 0) return null
  const start = points[0].values[metric] as number
  const current = points[points.length - 1].values[metric] as number
  const span = start - target
  const pct = span === 0 ? 100 : Math.max(0, Math.min(100, ((start - current) / span) * 100))
  return { metric, start, current, target, pct }
}

export interface GoalProjection {
  /** YYYY-MM-DD the trend reaches the target, or null when it can't be projected. */
  date: string | null
  daysFromNow: number | null
  /** False when there are too few points, the trend is flat, or it's moving away from the target. */
  onTrack: boolean
}

/** Projects the date the linear trend of past tests reaches a target value. Needs at least two data points. */
export function projectGoalDate(reports: HealthReport[], metric: GoalMetric, target: number, today: Date = new Date()): GoalProjection {
  const points = sortReports(reports)
    .filter((r) => r.values[metric] !== null)
    .map((r) => ({ t: new Date(`${reportDate(r)}T00:00:00Z`).getTime(), v: r.values[metric] as number }))
  if (points.length < 2) return { date: null, daysFromNow: null, onTrack: false }

  const t0 = points[0].t
  const xs = points.map((p) => (p.t - t0) / 86_400_000)
  const ys = points.map((p) => p.v)
  const n = xs.length
  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0)
  const sumXX = xs.reduce((a, x) => a + x * x, 0)
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return { date: null, daysFromNow: null, onTrack: false }
  const slope = (n * sumXY - sumX * sumY) / denom // change per day

  const current = ys[ys.length - 1]
  const remaining = target - current
  if (remaining === 0) return { date: today.toISOString().slice(0, 10), daysFromNow: 0, onTrack: true }
  if (slope === 0) return { date: null, daysFromNow: null, onTrack: false }

  const daysNeeded = remaining / slope
  if (daysNeeded < 0) return { date: null, daysFromNow: null, onTrack: false } // trend is moving away from the target

  const days = Math.round(daysNeeded)
  const date = new Date(today.getTime() + days * 86_400_000)
  return { date: date.toISOString().slice(0, 10), daysFromNow: days, onTrack: true }
}

// ---------- Reminder ----------

export interface Reminder {
  /** Days since the last test, or null when there's no test yet. */
  daysSince: number | null
  /** True when a fresh test is due. */
  due: boolean
}

/** Whether it's time to prompt for a fresh InBody test — the last one is null (never tested) or older than `thresholdDays`. */
export function healthReminder(reports: HealthReport[], today: Date = new Date(), thresholdDays = 30): Reminder {
  const sorted = sortReports(reports)
  const latest = sorted[sorted.length - 1]
  if (!latest) return { daysSince: null, due: true }
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const daysSince = Math.round((start - Date.parse(`${reportDate(latest)}T00:00:00Z`)) / 86_400_000)
  return { daysSince, due: daysSince >= thresholdDays }
}

// ---------- Daily logs ----------

export function blankLog(date: string): DailyLog {
  return { date, weight: null, steps: null, waterL: null, sleepH: null, note: '' }
}

export const sortLogs = (logs: DailyLog[]) => [...logs].sort((a, b) => a.date.localeCompare(b.date))

export interface LogAverages {
  weight: number | null
  steps: number | null
  waterL: number | null
  sleepH: number | null
}

/** Averages each metric over the last `days` days (today inclusive), ignoring entries where it's missing. */
export function logAverages(logs: DailyLog[], days: number, today: Date = new Date()): LogAverages {
  const end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const start = end - (days - 1) * 86_400_000
  const inRange = logs.filter((l) => {
    const t = Date.parse(`${l.date}T00:00:00Z`)
    return t >= start && t <= end
  })
  const avg = (key: keyof LogAverages) => {
    const vals = inRange.map((l) => l[key]).filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  return { weight: avg('weight'), steps: avg('steps'), waterL: avg('waterL'), sleepH: avg('sleepH') }
}
