// Health report (InBody body-composition) storage for the admin dashboard.
//
// Data lives in _data/health/reports.json in the vault bucket (hidden from the document list):
//   { reports: HealthReport[], updatedAt }
//
// A report is one InBody test: the measured values, the normal ranges printed next to them (they depend on height and
// sex, so they are kept per report), and the segmental lean / fat analysis. `scan` reads a photo of the printed sheet
// with the vision model and returns the values for the user to check — nothing is saved until they confirm.
// Everything coming from the browser is re-validated here.

const crypto = require('crypto')
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const { callOpenAI, fail, EXTRACT_MODEL } = require('./statements')

const REPORTS_KEY = '_data/health/reports.json'
const GOAL_KEY = '_data/health/goal.json'
const LOGS_KEY = '_data/health/logs.json'
const MAX_REPORTS = 500
const MAX_LOGS = 2000
const MAX_IMAGE_CHARS = 4_500_000
const VISION_MODEL = () => process.env.OPENAI_MODEL_VISION || EXTRACT_MODEL()

// Keep in sync with METRICS in src/lib/health.ts.
const METRICS = [
  'weight', 'totalBodyWater', 'protein', 'minerals', 'bodyFatMass', 'skeletalMuscleMass', 'fatFreeMass', 'bmi',
  'percentBodyFat', 'waistHipRatio', 'visceralFatLevel', 'basalMetabolicRate', 'obesityDegree', 'smi', 'inbodyScore',
  'targetWeight', 'weightControl', 'fatControl', 'muscleControl', 'recommendedCalories',
]
// Metrics the sheet prints a normal range for.
const RANGED = [
  'weight', 'totalBodyWater', 'protein', 'minerals', 'bodyFatMass', 'skeletalMuscleMass', 'fatFreeMass', 'bmi',
  'percentBodyFat', 'waistHipRatio', 'visceralFatLevel', 'basalMetabolicRate', 'obesityDegree',
]
const SEGMENTS = ['rightArm', 'leftArm', 'trunk', 'rightLeg', 'leftLeg']
const EVALS = ['', 'Under', 'Normal', 'Over']
const SEXES = ['', 'male', 'female']
const SOURCES = ['manual', 'scan', 'history']

// ---------- Validation ----------

function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

function testedAt(value) {
  if (typeof value !== 'string') return null
  const [date, time = ''] = value.split('T')
  if (!isRealDate(date)) return null
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time.slice(0, 5)) ? `${date}T${time.slice(0, 5)}` : date
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

// null for blanks and anything out of a sane range, so a misread value is dropped rather than stored.
function reading(value, min = -1000, max = 10000) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return Math.round(n * 100) / 100
}

function sanitizeRange(r) {
  if (!r || typeof r !== 'object') return null
  const low = reading(r.low)
  const high = reading(r.high)
  if (low === null || high === null || low > high) return null
  return { low, high }
}

function sanitizeSegments(raw) {
  const out = {}
  for (const seg of SEGMENTS) {
    const s = raw && typeof raw === 'object' ? raw[seg] : null
    out[seg] = {
      kg: reading(s && s.kg, 0, 200),
      eval: s && EVALS.includes(s.eval) ? s.eval : '',
    }
  }
  return out
}

function sanitizeReport(r) {
  if (!r || typeof r !== 'object') return null
  const at = testedAt(r.testedAt)
  if (!at) return null

  const values = {}
  for (const k of METRICS) values[k] = reading(r.values && r.values[k])
  // A report needs at least one real measurement to be worth keeping.
  if (!METRICS.some((k) => values[k] !== null)) return null

  const ranges = {}
  for (const k of RANGED) {
    const range = sanitizeRange(r.ranges && r.ranges[k])
    if (range) ranges[k] = range
  }

  const profile = r.profile && typeof r.profile === 'object' ? r.profile : {}
  const now = new Date().toISOString()
  return {
    id: typeof r.id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(r.id) ? r.id : crypto.randomUUID(),
    testedAt: at,
    device: text(r.device, 40),
    profile: {
      heightCm: reading(profile.heightCm, 50, 260),
      age: reading(profile.age, 1, 130),
      sex: SEXES.includes(profile.sex) ? profile.sex : '',
    },
    values,
    ranges,
    segments: {
      lean: sanitizeSegments(r.segments && r.segments.lean),
      fat: sanitizeSegments(r.segments && r.segments.fat),
    },
    notes: text(r.notes, 2000),
    source: SOURCES.includes(r.source) ? r.source : 'manual',
    createdAt: typeof r.createdAt === 'string' && r.createdAt ? r.createdAt.slice(0, 30) : now,
    updatedAt: now,
  }
}

// ---------- Goal ----------

function sanitizeGoal(g) {
  if (!g || typeof g !== 'object') return null
  const weightKg = reading(g.weightKg, 20, 400)
  const bodyFatPct = reading(g.bodyFatPct, 1, 80)
  if (weightKg === null && bodyFatPct === null) return null
  const targetDate = isRealDate(g.targetDate) ? g.targetDate : null
  return { weightKg, bodyFatPct, targetDate, notes: text(g.notes, 500), updatedAt: new Date().toISOString() }
}

// ---------- Daily logs ----------

function sanitizeLog(l) {
  if (!l || typeof l !== 'object') return null
  if (!isRealDate(l.date)) return null
  const weight = reading(l.weight, 20, 400)
  const steps = reading(l.steps, 0, 100000)
  const waterL = reading(l.waterL, 0, 20)
  const sleepH = reading(l.sleepH, 0, 24)
  const note = text(l.note, 300)
  if (weight === null && steps === null && waterL === null && sleepH === null && !note) return null
  return { date: l.date, weight, steps: steps === null ? null : Math.round(steps), waterL, sleepH, note }
}

// ---------- Photo scan ----------

const nnum = { type: ['number', 'null'] }
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
const rangeSchema = { anyOf: [obj({ low: { type: 'number' }, high: { type: 'number' } }), { type: 'null' }] }
const segSchema = obj(Object.fromEntries(SEGMENTS.map((s) => [s, obj({ kg: nnum, eval: { type: 'string', enum: EVALS } })])))

const SCAN_SCHEMA = obj({
  isBodyCompositionReport: { type: 'boolean' },
  testedAt: { type: ['string', 'null'] },
  device: { type: 'string' },
  profile: obj({ heightCm: nnum, age: nnum, sex: { type: 'string', enum: SEXES } }),
  values: obj(Object.fromEntries(METRICS.map((k) => [k, nnum]))),
  ranges: obj(Object.fromEntries(RANGED.map((k) => [k, rangeSchema]))),
  segments: obj({ lean: segSchema, fat: segSchema }),
  history: {
    type: 'array',
    items: obj({ date: { type: 'string' }, weight: nnum, skeletalMuscleMass: nnum, percentBodyFat: nnum }),
  },
})

const SCAN_RULES = `You read a photo of a printed body-composition result sheet (InBody or similar) and return its numbers exactly as printed.
- isBodyCompositionReport: false if the photo is not such a sheet (then leave everything else null/empty).
- testedAt: the test date/time as YYYY-MM-DDTHH:mm (24h), or YYYY-MM-DD if no time is printed.
- values (kg unless noted): weight, totalBodyWater (L), protein, minerals, bodyFatMass, skeletalMuscleMass (SMM),
  fatFreeMass, bmi (kg/m²), percentBodyFat (%), waistHipRatio, visceralFatLevel (level), basalMetabolicRate (kcal),
  obesityDegree (%), smi (kg/m²), inbodyScore (points out of 100), targetWeight, weightControl, fatControl,
  muscleControl (keep the sign: "-26.4 kg" is -26.4), recommendedCalories (recommended calorie intake, kcal).
- ranges: the normal range printed next to a value, e.g. "(37.9~46.3)" -> {low: 37.9, high: 46.3}. For waistHipRatio and
  visceralFatLevel use the Normal band of their scale (e.g. 0.80~0.90, visceral fat "Low 10 High" -> {low: 1, high: 9}).
  null when no range is printed.
- segments: Segmental Lean Analysis -> lean, Segmental Fat Analysis -> fat. Each has kg and the evaluation word under it
  (Under / Normal / Over). The figure's side labels say which side is Left and which is Right — follow them.
- history: every column of the "Body Composition History" table except the current test, dates as YYYY-MM-DD
  (the sheet prints yy.mm.dd).
Never guess a number you cannot read — use null.`

function sanitizeHistory(list, currentDate) {
  if (!Array.isArray(list)) return []
  return list
    .filter((h) => h && isRealDate(h.date) && h.date !== currentDate)
    .map((h) => ({
      date: h.date,
      weight: reading(h.weight, 0, 500),
      skeletalMuscleMass: reading(h.skeletalMuscleMass, 0, 200),
      percentBodyFat: reading(h.percentBodyFat, 0, 100),
    }))
    .filter((h) => h.weight !== null || h.skeletalMuscleMass !== null || h.percentBodyFat !== null)
    .slice(0, 20)
}

// ---------- Handlers ----------

function createHealthApi({ s3, bucket, ai = callOpenAI }) {
  async function load() {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: REPORTS_KEY }))
      const data = JSON.parse(await res.Body.transformToString())
      return Array.isArray(data.reports) ? data.reports : []
    } catch (err) {
      if (err.name === 'NoSuchKey') return []
      throw err
    }
  }

  async function store(reports) {
    const sorted = [...reports].sort((a, b) => a.testedAt.localeCompare(b.testedAt))
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: REPORTS_KEY,
        ContentType: 'application/json',
        Body: JSON.stringify({ reports: sorted, updatedAt: new Date().toISOString() }),
      }),
    )
    return sorted
  }

  async function list() {
    const reports = await load()
    return { statusCode: 200, body: { reports: reports.sort((a, b) => a.testedAt.localeCompare(b.testedAt)) } }
  }

  async function save(payload) {
    const incoming = Array.isArray(payload.reports) ? payload.reports : [payload.report]
    const clean = incoming.map(sanitizeReport).filter(Boolean)
    if (!clean.length) return { statusCode: 400, body: { error: 'A test date and at least one measurement are required.' } }

    const reports = await load()
    for (const report of clean) {
      const i = reports.findIndex((r) => r.id === report.id)
      if (i >= 0) reports[i] = { ...report, createdAt: reports[i].createdAt }
      else reports.push(report)
    }
    if (reports.length > MAX_REPORTS) return { statusCode: 400, body: { error: `You can keep up to ${MAX_REPORTS} reports.` } }
    const saved = await store(reports)
    return { statusCode: 200, body: { reports: saved, saved: clean } }
  }

  async function remove(query) {
    const id = typeof query.id === 'string' ? query.id : ''
    const reports = await load()
    const next = reports.filter((r) => r.id !== id)
    if (next.length === reports.length) return { statusCode: 404, body: { error: 'That report was not found.' } }
    return { statusCode: 200, body: { reports: await store(next) } }
  }

  // ---------- Goal ----------

  async function loadGoal() {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: GOAL_KEY }))
      const data = JSON.parse(await res.Body.transformToString())
      return data && typeof data === 'object' ? data : null
    } catch (err) {
      if (err.name === 'NoSuchKey') return null
      throw err
    }
  }

  async function getGoal() {
    return { statusCode: 200, body: { goal: await loadGoal() } }
  }

  async function saveGoal(payload) {
    const clean = sanitizeGoal(payload.goal)
    if (!clean) return { statusCode: 400, body: { error: 'Set a target weight and/or a target body fat %.' } }
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: GOAL_KEY, ContentType: 'application/json', Body: JSON.stringify(clean) }))
    return { statusCode: 200, body: { goal: clean } }
  }

  // ---------- Daily logs ----------

  async function loadLogs() {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: LOGS_KEY }))
      const data = JSON.parse(await res.Body.transformToString())
      return Array.isArray(data.logs) ? data.logs : []
    } catch (err) {
      if (err.name === 'NoSuchKey') return []
      throw err
    }
  }

  async function storeLogs(logs) {
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date))
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: LOGS_KEY, ContentType: 'application/json', Body: JSON.stringify({ logs: sorted, updatedAt: new Date().toISOString() }) }))
    return sorted
  }

  async function listLogs() {
    return { statusCode: 200, body: { logs: await loadLogs() } }
  }

  async function saveLog(payload) {
    const clean = sanitizeLog(payload.log)
    if (!clean) return { statusCode: 400, body: { error: 'A date and at least one value are required.' } }
    const logs = await loadLogs()
    const i = logs.findIndex((l) => l.date === clean.date)
    if (i >= 0) logs[i] = clean
    else logs.push(clean)
    if (logs.length > MAX_LOGS) return { statusCode: 400, body: { error: `You can keep up to ${MAX_LOGS} daily logs.` } }
    return { statusCode: 200, body: { logs: await storeLogs(logs) } }
  }

  async function removeLog(query) {
    const date = typeof query.date === 'string' ? query.date : ''
    const logs = await loadLogs()
    const next = logs.filter((l) => l.date !== date)
    if (next.length === logs.length) return { statusCode: 404, body: { error: 'That log was not found.' } }
    return { statusCode: 200, body: { logs: await storeLogs(next) } }
  }

  async function scan(payload) {
    const image = typeof payload.image === 'string' ? payload.image : ''
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) {
      return { statusCode: 400, body: { error: 'Please choose a JPEG, PNG or WebP photo of the report.' } }
    }
    if (image.length > MAX_IMAGE_CHARS) return { statusCode: 413, body: { error: 'That photo is too large. Please use a smaller one.' } }

    const raw = await ai({
      model: VISION_MODEL(),
      system: SCAN_RULES,
      user: [
        { type: 'input_text', text: 'Read this body-composition result sheet.' },
        { type: 'input_image', image_url: image, detail: 'high' },
      ],
      name: 'body_composition',
      schema: SCAN_SCHEMA,
      effort: 'medium',
      timeoutMs: 28000,
      maxTokens: 6000,
    })
    if (!raw || !raw.isBodyCompositionReport) throw fail('not_a_report', 'That photo doesn’t look like a body-composition report. Try a clearer, straight-on photo of the sheet.')

    const report = sanitizeReport({ ...raw, source: 'scan', id: undefined, createdAt: undefined })
    if (!report) throw fail('unreadable', 'Could not read the test date or any values from that photo. Try a clearer photo, or enter the values by hand.')
    // Not saved yet: the id and timestamps are assigned when the user confirms.
    delete report.id
    delete report.createdAt
    delete report.updatedAt
    return { statusCode: 200, body: { report, history: sanitizeHistory(raw.history, report.testedAt.slice(0, 10)) } }
  }

  // Returns null when the path is not a health route.
  return async function handle({ method, path, payload, query }) {
    try {
      if (method === 'GET' && path === '/admin/health/reports') return await list()
      if (method === 'POST' && path === '/admin/health/reports') return await save(payload)
      if (method === 'DELETE' && path === '/admin/health/reports') return await remove(query)
      if (method === 'POST' && path === '/admin/health/scan') return await scan(payload)
      if (method === 'GET' && path === '/admin/health/goal') return await getGoal()
      if (method === 'POST' && path === '/admin/health/goal') return await saveGoal(payload)
      if (method === 'GET' && path === '/admin/health/logs') return await listLogs()
      if (method === 'POST' && path === '/admin/health/logs') return await saveLog(payload)
      if (method === 'DELETE' && path === '/admin/health/logs') return await removeLog(query)
      return null
    } catch (err) {
      if (err.code && err.statusCode) return { statusCode: err.statusCode, body: { error: err.message, code: err.code } }
      throw err
    }
  }
}

module.exports = { createHealthApi, sanitizeReport, sanitizeHistory, sanitizeGoal, sanitizeLog, METRICS, RANGED, SEGMENTS }
