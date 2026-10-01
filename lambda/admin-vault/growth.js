// Small documents for the growth modules: trading guardrails, habits, life-admin deadlines, monthly reviews,
// the debt plan and subscription choices.
//
//   GET  /admin/growth?doc=<name>             { doc, value }
//   POST /admin/growth  { doc, value }        { doc, value }   (replaces the whole document)
//
// Each document lives in _data/growth/<name>.json and is re-validated field by field here: nothing from the browser is
// stored as-is.

const crypto = require('crypto')
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')

const ROOT = '_data/growth'
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const amount = (v, max = 1e10) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 100) / 100 : 0)
const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : 0)
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`))
const isMonth = (m) => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)
const id = (v) => (typeof v === 'string' && /^[a-z0-9-]{4,32}$/.test(v) ? v : crypto.randomBytes(5).toString('hex'))
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : [])

const HABIT_AUTO = ['', 'no-delivery', 'steps', 'rules', 'sleep']
const HOUSE_GROUPS = ['rentSalem', 'rentBengaluru', 'rentOther', 'electricity', 'cookingGas', 'fuel', 'bikeService', 'food', 'quickCommerce', 'rides', 'shopping']
const LIFE_CATEGORIES = ['identity', 'vehicle', 'insurance', 'tax', 'home', 'finance', 'health', 'other']

const SANITIZERS = {
  guardrails(v) {
    return {
      maxLossPerTrade: amount(v?.maxLossPerTrade),
      weeklyLossLimit: amount(v?.weeklyLossLimit),
      maxQtyPerTrade: amount(v?.maxQtyPerTrade, 1e7),
      cooldownDays: int(v?.cooldownDays, 30),
      checklist: list(v?.checklist, 12).map((c) => text(c, 120)).filter(Boolean),
    }
  },
  habits(v) {
    const habits = list(v?.habits, 12)
      .map((h) => ({ id: id(h?.id), name: text(h?.name, 60), auto: HABIT_AUTO.includes(h?.auto) ? h.auto : '', target: amount(h?.target, 1e6), color: typeof h?.color === 'string' && /^#[0-9a-f]{6}$/i.test(h.color) ? h.color : '' }))
      .filter((h) => h.name)
    const ids = new Set(habits.map((h) => h.id))
    const checks = {}
    for (const [date, done] of Object.entries(v?.checks && typeof v.checks === 'object' ? v.checks : {}).slice(-800)) {
      if (!isDate(date)) continue
      const kept = list(done, 12).filter((x) => ids.has(x))
      if (kept.length) checks[date] = kept
    }
    return { habits, checks }
  },
  'life-admin'(v) {
    return {
      items: list(v?.items, 200)
        .map((i) => ({
          id: id(i?.id),
          title: text(i?.title, 100),
          category: LIFE_CATEGORIES.includes(i?.category) ? i.category : 'other',
          dueDate: isDate(i?.dueDate) ? i.dueDate : '',
          repeatMonths: int(i?.repeatMonths, 120),
          notes: text(i?.notes, 500),
          done: i?.done === true,
        }))
        .filter((i) => i.title && i.dueDate),
    }
  },
  reviews(v) {
    const months = {}
    for (const [m, r] of Object.entries(v?.months && typeof v.months === 'object' ? v.months : {}).slice(-60)) {
      if (!isMonth(m)) continue
      months[m] = { commitment: text(r?.commitment, 300), notes: text(r?.notes, 3000), keptCommitment: r?.keptCommitment === true ? true : r?.keptCommitment === false ? false : null }
    }
    return { months }
  },
  debt(v) {
    return { extraPerMonth: amount(v?.extraPerMonth), strategy: v?.strategy === 'snowball' ? 'snowball' : 'avalanche' }
  },
  // End-to-end encrypted: the browser encrypts with a key from your password or pattern; only ciphertext is stored.
  diary(v) {
    const b64 = (x, max) => (typeof x === 'string' && x.length <= max && /^[A-Za-z0-9+/=]*$/.test(x) ? x : '')
    const box = (b, max) => (b && b64(b.iv, 32) && b64(b.ct, max) ? { iv: b.iv, ct: b.ct } : null)
    return {
      method: v?.method === 'pattern' ? 'pattern' : v?.method === 'password' ? 'password' : '',
      salt: b64(v?.salt, 64),
      check: box(v?.check, 200),
      entries: list(v?.entries, 5000)
        .map((e) => ({ id: id(e?.id), date: isDate(e?.date) ? e.date : '', box: box(e?.box, 80_000) }))
        .filter((e) => e.date && e.box),
    }
  },
  calendar(v) {
    const pick = (x, max) => (Number.isInteger(x) && x >= -1 && x <= max ? x : -1)
    return { place: text(v?.place, 40) || 'Chennai', rasi: pick(v?.rasi, 11), star: pick(v?.star, 26), notify: v?.notify !== false }
  },
  household(v) {
    return {
      manual: list(v?.manual, 500)
        .map((m) => ({ id: id(m?.id), group: HOUSE_GROUPS.includes(m?.group) ? m.group : '', month: isMonth(m?.month) ? m.month : '', amount: amount(m?.amount, 1e7) }))
        .filter((m) => m.group && m.month),
    }
  },
  profile(v) {
    const photo = typeof v?.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v.photo) && v.photo.length <= 200_000 ? v.photo : ''
    return {
      displayName: text(v?.displayName, 40),
      fullName: text(v?.fullName, 80),
      email: text(v?.email, 120),
      phone: text(v?.phone, 30),
      dob: isDate(v?.dob) ? v.dob : '',
      city: text(v?.city, 60),
      occupation: text(v?.occupation, 80),
      bio: text(v?.bio, 300),
      photo,
    }
  },
  water(v) {
    const logs = {}
    for (const [date, ml] of Object.entries(v?.logs && typeof v.logs === 'object' ? v.logs : {}).slice(-800)) {
      if (isDate(date) && int(ml, 20000) > 0) logs[date] = ml
    }
    const hour = (h, d) => (Number.isInteger(h) && h >= 0 && h <= 23 ? h : d)
    return {
      weightKg: amount(v?.weightKg, 400),
      activity: ['low', 'moderate', 'high'].includes(v?.activity) ? v.activity : 'moderate',
      hot: v?.hot === true,
      customMl: int(v?.customMl, 10000),
      targetMl: int(v?.targetMl, 10000),
      glassMl: int(v?.glassMl, 2000) || 250,
      reminders: v?.reminders !== false,
      startHour: hour(v?.startHour, 8),
      endHour: hour(v?.endHour, 21),
      logs,
    }
  },
  subscriptions(v) {
    return {
      cancelled: list(v?.cancelled, 200).map((c) => ({ key: text(c?.key, 80), date: isDate(c?.date) ? c.date : '', yearly: amount(c?.yearly) })).filter((c) => c.key),
      ignored: list(v?.ignored, 200).map((k) => text(k, 80)).filter(Boolean),
    }
  },
}

const DOCS = Object.keys(SANITIZERS)

function createGrowthApi({ s3, bucket }) {
  const key = (doc) => `${ROOT}/${doc}.json`

  async function read(doc) {
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key(doc) }))
      return JSON.parse(await out.Body.transformToString())
    } catch (err) {
      if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) return SANITIZERS[doc]({})
      throw err
    }
  }

  return async function handle({ method, path, query, payload }) {
    if (path !== '/admin/growth') return null
    const doc = method === 'GET' ? query?.doc : payload?.doc
    if (!DOCS.includes(doc)) return { statusCode: 400, body: { error: 'Unknown document.' } }
    if (method === 'GET') return { statusCode: 200, body: { doc, value: SANITIZERS[doc](await read(doc)) } }
    if (method === 'POST') {
      const value = SANITIZERS[doc](payload?.value ?? {})
      const body = JSON.stringify(value)
      if (body.length > (doc === 'diary' ? 6_000_000 : 300_000)) return { statusCode: 413, body: { error: 'That is too much to save at once.' } }
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key(doc), Body: body, ContentType: 'application/json' }))
      return { statusCode: 200, body: { doc, value } }
    }
    return { statusCode: 405, body: { error: 'Method not allowed.' } }
  }
}

module.exports = { createGrowthApi, SANITIZERS, DOCS }
