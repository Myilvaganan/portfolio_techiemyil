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
  reminders(v) {
    const children = list(v?.children, 10).map((c) => ({ id: id(c?.id), name: text(c?.name, 40), dob: isDate(c?.dob) ? c.dob : '' })).filter((c) => c.name && c.dob)
    const ids = new Set(children.map((c) => c.id))
    const vaccines = {}
    for (const [cid, doses] of Object.entries(v?.vaccines && typeof v.vaccines === 'object' ? v.vaccines : {})) {
      if (!ids.has(cid) || !doses || typeof doses !== 'object') continue
      vaccines[cid] = {}
      for (const [code, date] of Object.entries(doses).slice(0, 80)) if (/^[a-z0-9]{2,8}$/.test(code) && isDate(date)) vaccines[cid][code] = date
    }
    return {
      items: list(v?.items, 300)
        .map((r) => ({ id: id(r?.id), title: text(r?.title, 100), note: text(r?.note, 300), date: isDate(r?.date) ? r.date : '', hour: Number.isInteger(r?.hour) && r.hour >= 0 && r.hour <= 23 ? r.hour : 9, repeat: ['none', 'daily', 'weekly', 'monthly', 'yearly'].includes(r?.repeat) ? r.repeat : 'none', done: r?.done === true }))
        .filter((r) => r.title && r.date),
      children,
      vaccines,
    }
  },
  tasks(v) {
    return {
      tasks: list(v?.tasks, 500)
        .map((t) => ({ id: id(t?.id), title: text(t?.title, 160), when: ['today', 'week', 'someday'].includes(t?.when) ? t.when : 'today', done: t?.done === true, doneOn: isDate(t?.doneOn) ? t.doneOn : '', created: isDate(t?.created) ? t.created : '' }))
        .filter((t) => t.title),
      // Focus sessions: date + minutes (+ the task worked on).
      sessions: list(v?.sessions, 3000)
        .map((x) => ({ date: isDate(x?.date) ? x.date : '', minutes: int(x?.minutes, 600), task: text(x?.task, 160) }))
        .filter((x) => x.date && x.minutes),
    }
  },
  gate(v) {
    const days = {}
    for (const [date, d] of Object.entries(v?.days && typeof v.days === 'object' ? v.days : {}).slice(-400)) {
      if (!isDate(date)) continue
      days[date] = { sleep: int(d?.sleep, 5), mood: int(d?.mood, 5), rulesRead: d?.rulesRead === true, plan: text(d?.plan, 300), checks: list(d?.checks, 12).map((c) => int(c, 50)) }
    }
    return { days }
  },
  mood(v) {
    const days = {}
    for (const [date, d] of Object.entries(v?.days && typeof v.days === 'object' ? v.days : {}).slice(-800)) {
      if (!isDate(date)) continue
      days[date] = { sleepH: amount(d?.sleepH, 24), quality: int(d?.quality, 5), mood: int(d?.mood, 5), energy: int(d?.energy, 5), note: text(d?.note, 200) }
    }
    return { days }
  },
  meds(v) {
    const items = list(v?.items, 30)
      .map((m) => ({ id: id(m?.id), name: text(m?.name, 60), dose: text(m?.dose, 40), hours: list(m?.hours, 6).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23), active: m?.active !== false }))
      .filter((m) => m.name && m.hours.length)
    const ids = new Set(items.map((m) => m.id))
    const taken = {}
    for (const [date, done] of Object.entries(v?.taken && typeof v.taken === 'object' ? v.taken : {}).slice(-200)) {
      if (!isDate(date)) continue
      const kept = list(done, 100).filter((x) => typeof x === 'string' && ids.has(x.split('@')[0]))
      if (kept.length) taken[date] = kept
    }
    return { items, taken, reminders: v?.reminders !== false }
  },
  family(v) {
    return {
      people: list(v?.people, 200)
        .map((p) => ({ id: id(p?.id), name: text(p?.name, 60), relation: text(p?.relation, 40), kind: ['birthday', 'anniversary', 'memorial', 'other'].includes(p?.kind) ? p.kind : 'birthday', date: isDate(p?.date) ? p.date : '', star: Number.isInteger(p?.star) && p.star >= -1 && p.star <= 26 ? p.star : -1, tamilMonth: Number.isInteger(p?.tamilMonth) && p.tamilMonth >= -1 && p.tamilMonth <= 11 ? p.tamilMonth : -1 }))
        .filter((p) => p.name && (p.date || p.star >= 0)),
    }
  },
  receipts(v) {
    return {
      items: list(v?.items, 2000)
        .map((r) => ({ id: id(r?.id), date: isDate(r?.date) ? r.date : '', merchant: text(r?.merchant, 80), amount: amount(r?.amount, 1e8), category: text(r?.category, 40), note: text(r?.note, 200) }))
        .filter((r) => r.date && r.amount),
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

const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isReceipt', 'merchant', 'date', 'amount', 'category'],
  properties: {
    isReceipt: { type: 'boolean' },
    merchant: { type: 'string' },
    date: { type: ['string', 'null'] },
    amount: { type: ['number', 'null'] },
    category: { type: 'string', enum: ['Groceries', 'Food & Dining', 'Fuel', 'Shopping', 'Medical', 'Bills & Utilities', 'Travel', 'Home', 'Education', 'Other'] },
  },
}
const RECEIPT_RULES = 'You read Indian shop receipts and bills. Return the merchant name, the bill date as YYYY-MM-DD (null if not printed), the final total paid in rupees (after tax and discounts; null if unreadable) and the best category. If the photo is not a receipt or bill, set isReceipt false.'

function createGrowthApi({ s3, bucket, ai = null, visionModel = () => undefined }) {
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

  async function scanReceipt(payload) {
    const image = typeof payload?.image === 'string' ? payload.image : ''
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return { statusCode: 400, body: { error: 'Please choose a JPEG, PNG or WebP photo of the receipt.' } }
    if (image.length > 4_500_000) return { statusCode: 413, body: { error: 'That photo is too large. Please use a smaller one.' } }
    if (!ai) return { statusCode: 503, body: { error: 'Receipt reading is not set up.' } }
    try {
      const r = await ai({ model: visionModel(), system: RECEIPT_RULES, user: [{ type: 'input_text', text: 'Read this receipt.' }, { type: 'input_image', image_url: image, detail: 'high' }], name: 'receipt', schema: RECEIPT_SCHEMA, effort: 'low', timeoutMs: 25000, maxTokens: 800 })
      if (!r?.isReceipt) return { statusCode: 422, body: { error: 'That doesn’t look like a receipt. Try a clearer, straight-on photo.' } }
      return { statusCode: 200, body: { merchant: text(r.merchant, 80), date: isDate(r.date) ? r.date : '', amount: amount(r.amount ?? 0, 1e8), category: text(r.category, 40) } }
    } catch (err) {
      if (err.code && err.statusCode) return { statusCode: err.statusCode, body: { error: err.message } }
      throw err
    }
  }

  return async function handle({ method, path, query, payload }) {
    if (method === 'POST' && path === '/admin/receipt/scan') return scanReceipt(payload)
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
