import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createHealthApi, sanitizeReport, sanitizeHistory, sanitizeGoal, sanitizeLog } = require('./health.js')

// In-memory stand-in for S3: enough of Get/Put for the health store.
function fakeS3() {
  const objects = new Map()
  return {
    objects,
    async send(cmd) {
      const { Key, Body } = cmd.input
      switch (cmd.constructor.name) {
        case 'GetObjectCommand':
          if (!objects.has(Key)) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' })
          return { Body: { transformToString: async () => objects.get(Key) } }
        case 'PutObjectCommand':
          objects.set(Key, Body)
          return {}
        default:
          throw new Error(`unexpected ${cmd.constructor.name}`)
      }
    },
  }
}

const report = (over = {}) => ({
  testedAt: '2026-09-24T07:13',
  device: 'InBody260',
  profile: { heightCm: 175, age: 29, sex: 'male' },
  values: { weight: 95.9, skeletalMuscleMass: 33.3, percentBodyFat: 38.4, visceralFatLevel: 18 },
  ranges: { weight: { low: 57.3, high: 77.5 }, percentBodyFat: { low: 10, high: 20 } },
  segments: { lean: { trunk: { kg: 27.5, eval: 'Normal' } }, fat: { trunk: { kg: 19.5, eval: 'Over' } } },
  ...over,
})

describe('sanitizeReport', () => {
  it('keeps valid values and fills every metric and segment', () => {
    const r = sanitizeReport(report())
    expect(r.testedAt).toBe('2026-09-24T07:13')
    expect(r.values.weight).toBe(95.9)
    expect(r.values.bmi).toBeNull()
    expect(r.ranges.weight).toEqual({ low: 57.3, high: 77.5 })
    expect(r.segments.lean.trunk).toEqual({ kg: 27.5, eval: 'Normal' })
    expect(r.segments.fat.leftLeg).toEqual({ kg: null, eval: '' })
    expect(r.source).toBe('manual')
  })

  it('rejects a bad date or a report with no measurements', () => {
    expect(sanitizeReport(report({ testedAt: '2026-02-30' }))).toBeNull()
    expect(sanitizeReport(report({ values: { weight: '' } }))).toBeNull()
  })

  it('drops inverted ranges, bad enums and out-of-range readings', () => {
    const r = sanitizeReport(
      report({
        ranges: { bmi: { low: 25, high: 18.5 } },
        profile: { heightCm: 9999, sex: 'robot' },
        segments: { lean: { trunk: { kg: 27.5, eval: 'Huge' } } },
      }),
    )
    expect(r.ranges.bmi).toBeUndefined()
    expect(r.profile).toEqual({ heightCm: null, age: null, sex: '' })
    expect(r.segments.lean.trunk.eval).toBe('')
  })
})

describe('sanitizeHistory', () => {
  it('drops the current test and empty columns', () => {
    const h = sanitizeHistory(
      [
        { date: '2025-07-08', weight: 93.6, skeletalMuscleMass: 34.1, percentBodyFat: 35.5 },
        { date: '2026-09-24', weight: 95.9, skeletalMuscleMass: 33.3, percentBodyFat: 38.4 },
        { date: '2025-01-01', weight: null, skeletalMuscleMass: null, percentBodyFat: null },
      ],
      '2026-09-24',
    )
    expect(h).toEqual([{ date: '2025-07-08', weight: 93.6, skeletalMuscleMass: 34.1, percentBodyFat: 35.5 }])
  })
})

describe('health api', () => {
  it('saves, updates, lists in date order and deletes', async () => {
    const api = createHealthApi({ s3: fakeS3(), bucket: 'b' })
    const first = await api({ method: 'POST', path: '/admin/health/reports', payload: { report: report() } })
    expect(first.statusCode).toBe(200)
    const id = first.body.saved[0].id

    await api({ method: 'POST', path: '/admin/health/reports', payload: { reports: [report({ testedAt: '2025-07-08', values: { weight: 93.6 } })] } })
    await api({ method: 'POST', path: '/admin/health/reports', payload: { report: report({ id, notes: 'after diet' }) } })

    const listed = await api({ method: 'GET', path: '/admin/health/reports', query: {} })
    expect(listed.body.reports.map((r) => r.testedAt)).toEqual(['2025-07-08', '2026-09-24T07:13'])
    expect(listed.body.reports[1].notes).toBe('after diet')

    const removed = await api({ method: 'DELETE', path: '/admin/health/reports', query: { id } })
    expect(removed.body.reports).toHaveLength(1)
    expect((await api({ method: 'DELETE', path: '/admin/health/reports', query: { id } })).statusCode).toBe(404)
  })

  it('rejects an invalid report', async () => {
    const api = createHealthApi({ s3: fakeS3(), bucket: 'b' })
    const res = await api({ method: 'POST', path: '/admin/health/reports', payload: { report: { testedAt: 'nope' } } })
    expect(res.statusCode).toBe(400)
  })

  it('scans a photo into an unsaved report plus history', async () => {
    let request
    const ai = async (req) => {
      request = req
      return { isBodyCompositionReport: true, ...report(), history: [{ date: '2025-07-08', weight: 93.6, skeletalMuscleMass: 34.1, percentBodyFat: 35.5 }] }
    }
    const api = createHealthApi({ s3: fakeS3(), bucket: 'b', ai })
    const res = await api({ method: 'POST', path: '/admin/health/scan', payload: { image: 'data:image/jpeg;base64,AAAA' } })
    expect(res.statusCode).toBe(200)
    expect(res.body.report.id).toBeUndefined()
    expect(res.body.report.source).toBe('scan')
    expect(res.body.history).toHaveLength(1)
    expect(request.user[1]).toMatchObject({ type: 'input_image', image_url: 'data:image/jpeg;base64,AAAA' })
  })

  it('refuses non-images and photos that are not reports', async () => {
    const api = createHealthApi({ s3: fakeS3(), bucket: 'b', ai: async () => ({ isBodyCompositionReport: false }) })
    expect((await api({ method: 'POST', path: '/admin/health/scan', payload: { image: 'data:text/html;base64,AAAA' } })).statusCode).toBe(400)
    const res = await api({ method: 'POST', path: '/admin/health/scan', payload: { image: 'data:image/png;base64,AAAA' } })
    expect(res.statusCode).toBe(422)
    expect(res.body.code).toBe('not_a_report')
  })

  it('ignores other paths', async () => {
    const api = createHealthApi({ s3: fakeS3(), bucket: 'b' })
    expect(await api({ method: 'GET', path: '/admin/health/other', query: {} })).toBeNull()
  })
})

describe('sanitizeGoal', () => {
  it('keeps a valid goal with an optional date', () => {
    const g = sanitizeGoal({ weightKg: 78, bodyFatPct: 18, targetDate: '2026-12-31', notes: 'lean out' })
    expect(g).toMatchObject({ weightKg: 78, bodyFatPct: 18, targetDate: '2026-12-31', notes: 'lean out' })
  })

  it('rejects a goal with neither target and drops a bad date', () => {
    expect(sanitizeGoal({ weightKg: null, bodyFatPct: null })).toBeNull()
    expect(sanitizeGoal({ weightKg: 78, targetDate: 'nope' })).toMatchObject({ weightKg: 78, targetDate: null })
  })
})

describe('sanitizeLog', () => {
  it('keeps a log with at least one value', () => {
    const l = sanitizeLog({ date: '2026-09-20', weight: 91.4, steps: 8123.6, waterL: 2.5, sleepH: 7.5, note: 'ran 5k' })
    expect(l).toEqual({ date: '2026-09-20', weight: 91.4, steps: 8124, waterL: 2.5, sleepH: 7.5, note: 'ran 5k' })
  })

  it('rejects a bad date or an entry with nothing in it', () => {
    expect(sanitizeLog({ date: 'nope', weight: 90 })).toBeNull()
    expect(sanitizeLog({ date: '2026-09-20' })).toBeNull()
  })
})

describe('health api: goal', () => {
  it('saves and fetches a goal, rejecting an empty one', async () => {
    const api = createHealthApi({ s3: fakeS3(), bucket: 'b' })
    expect((await api({ method: 'GET', path: '/admin/health/goal', query: {} })).body.goal).toBeNull()

    const bad = await api({ method: 'POST', path: '/admin/health/goal', payload: { goal: {} } })
    expect(bad.statusCode).toBe(400)

    const saved = await api({ method: 'POST', path: '/admin/health/goal', payload: { goal: { weightKg: 75, targetDate: '2027-01-01' } } })
    expect(saved.statusCode).toBe(200)
    expect(saved.body.goal).toMatchObject({ weightKg: 75, targetDate: '2027-01-01' })

    const fetched = await api({ method: 'GET', path: '/admin/health/goal', query: {} })
    expect(fetched.body.goal).toMatchObject({ weightKg: 75 })
  })
})

describe('health api: logs', () => {
  it('upserts by date, lists sorted and deletes', async () => {
    const api = createHealthApi({ s3: fakeS3(), bucket: 'b' })
    await api({ method: 'POST', path: '/admin/health/logs', payload: { log: { date: '2026-09-20', weight: 91 } } })
    await api({ method: 'POST', path: '/admin/health/logs', payload: { log: { date: '2026-09-18', steps: 9000 } } })
    await api({ method: 'POST', path: '/admin/health/logs', payload: { log: { date: '2026-09-20', weight: 90.5, note: 'updated' } } })

    const listed = await api({ method: 'GET', path: '/admin/health/logs', query: {} })
    expect(listed.body.logs.map((l) => l.date)).toEqual(['2026-09-18', '2026-09-20'])
    expect(listed.body.logs[1]).toMatchObject({ weight: 90.5, note: 'updated' })

    const removed = await api({ method: 'DELETE', path: '/admin/health/logs', query: { date: '2026-09-18' } })
    expect(removed.body.logs).toHaveLength(1)
    expect((await api({ method: 'DELETE', path: '/admin/health/logs', query: { date: '2026-09-18' } })).statusCode).toBe(404)
  })

  it('rejects an invalid log', async () => {
    const api = createHealthApi({ s3: fakeS3(), bucket: 'b' })
    const res = await api({ method: 'POST', path: '/admin/health/logs', payload: { log: { date: 'nope' } } })
    expect(res.statusCode).toBe(400)
  })
})
