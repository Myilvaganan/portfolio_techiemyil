// Push notifications to the installed admin app.
//
//   GET  /admin/push/key                        { publicKey }
//   POST /admin/push/subscribe  { subscription } { ok }
//   POST /admin/push/unsubscribe { endpoint }    { ok }
//   POST /admin/push/test                        { sent }
//   POST /admin/push/fcm/register   { token }    { ok }   (Android app, via Firebase Cloud Messaging)
//   POST /admin/push/fcm/unregister { token }    { ok }
//
// A scheduled EventBridge rule invokes the Lambda with { source: 'aws.events', detail-type: 'Scheduled Event' }
// twice a day; `runScheduled` then works out what is worth a notification and sends it to every subscribed device.
// Alerts (all read from data already in the vault):
//   • a credit-card bill due within 3 days
//   • a Life Admin deadline due within 3 days, or overdue
//   • the daily trading loss limit hit today (afternoon run, after the Indian market close)

const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const webpush = require('web-push')
const { createFcm } = require('./fcm')

const ROOT = '_data'
const SUBS_KEY = `${ROOT}/push/subscriptions.json`
const MAX_SUBS = 10
const FCM_TOKENS_KEY = `${ROOT}/push/fcm-tokens.json`
// The Firebase service-account key lives in the private vault bucket, not in the code or the Lambda environment.
const FCM_ACCOUNT_KEY = `${ROOT}/push/fcm-service-account.json`

const DAY = 86_400_000
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)
const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`
const netOf = (t) => ((Number(t.grossPnl) || 0) - (Number(t.fees) || 0)) * (t.currency === 'USD' ? Number(t.fxRate) || 1 : 1)

/** Today in India (the alerts are about the user's day, not UTC's). */
const istDate = (now) => new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10)

/** Pure: which notifications to send, from the vault data. `slot` is 'morning' or 'evening'. */
function buildAlerts({ today, slot, cardStatements = [], lifeItems = [], trades = [], dailyLossLimit = 0 }) {
  const alerts = []

  // Card bills: the newest statement per card, due within three days.
  const latest = new Map()
  for (const s of cardStatements) {
    const key = s.cardLast4 || s.accountKey
    if (!s.dueDate) continue
    if (!latest.has(key) || s.dueDate > latest.get(key).dueDate) latest.set(key, s)
  }
  for (const s of latest.values()) {
    const d = daysBetween(today, s.dueDate)
    if (d >= 0 && d <= 3 && (s.totalDue || 0) > 0) {
      alerts.push({ tag: `card-${s.cardLast4 || s.accountKey}-${s.dueDate}`, title: d === 0 ? 'Card bill due today' : `Card bill due in ${d} day${d === 1 ? '' : 's'}`, body: `${s.cardName || 'Card'} ••${s.cardLast4 || ''}: ${inr(s.totalDue)} by ${s.dueDate}.`, url: '/credit-cards' })
    }
  }

  // Life Admin deadlines (only in the morning, so they don't repeat twice a day).
  if (slot === 'morning') {
    for (const i of lifeItems) {
      if (i.done || !i.dueDate) continue
      const d = daysBetween(today, i.dueDate)
      if (d <= 3) alerts.push({ tag: `life-${i.id}-${i.dueDate}`, title: d < 0 ? `Overdue: ${i.title}` : d === 0 ? `Due today: ${i.title}` : `Due in ${d} day${d === 1 ? '' : 's'}: ${i.title}`, body: i.notes || `Due ${i.dueDate}.`, url: '/life-admin' })
    }
  }

  // Daily loss limit, after the market has closed.
  if (slot === 'evening' && dailyLossLimit > 0) {
    const todays = trades.filter((t) => t.date === today)
    const net = todays.reduce((s, t) => s + netOf(t), 0)
    if (todays.length && net <= -dailyLossLimit) {
      alerts.push({ tag: `loss-${today}`, title: 'Daily loss limit broken', body: `Today: ${inr(net)} across ${todays.length} trades (limit ${inr(dailyLossLimit)}). Review before tomorrow.`, url: '/guardrails' })
    }
  }
  return alerts
}

function createPushApi({ s3, bucket, publicKey, privateKey, subject = 'mailto:admin@techiemyil.com', now = () => new Date(), fcmFactory = createFcm }) {
  const ready = Boolean(publicKey && privateKey)
  if (ready) webpush.setVapidDetails(subject, publicKey, privateKey)

  async function getJson(key, fallback) {
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      return JSON.parse(await out.Body.transformToString())
    } catch (err) {
      if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) return fallback
      throw err
    }
  }
  const putJson = (key, value) => s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: JSON.stringify(value), ContentType: 'application/json' }))

  let fcmPromise = null
  /** The FCM sender, or null when no service account has been uploaded. */
  function fcm() {
    fcmPromise ??= getJson(FCM_ACCOUNT_KEY, null).then((sa) => (sa?.private_key ? fcmFactory({ serviceAccount: sa }) : null)).catch((err) => {
      fcmPromise = null
      throw err
    })
    return fcmPromise
  }

  async function sendFcm(alerts) {
    const sender = await fcm()
    if (!sender || !alerts.length) return 0
    const tokens = await getJson(FCM_TOKENS_KEY, [])
    const dead = new Set()
    let sent = 0
    for (const token of tokens) {
      for (const a of alerts) {
        const r = await sender.send(token, a)
        if (r === 'ok') sent++
        else if (r === 'gone') dead.add(token)
      }
    }
    if (dead.size) await putJson(FCM_TOKENS_KEY, tokens.filter((t) => !dead.has(t)))
    return sent
  }

  const validSub = (s) => s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string'

  /** Send to every device; devices the push service reports as gone (404/410) are removed. */
  async function sendAll(alerts) {
    return (await sendWeb(alerts)) + (await sendFcm(alerts))
  }

  async function sendWeb(alerts) {
    if (!ready || !alerts.length) return 0
    const subs = await getJson(SUBS_KEY, [])
    const dead = new Set()
    let sent = 0
    for (const sub of subs) {
      for (const a of alerts) {
        try {
          await webpush.sendNotification(sub, JSON.stringify(a), { TTL: 6 * 3600, urgency: 'normal', topic: a.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) })
          sent++
        } catch (err) {
          if (err && (err.statusCode === 404 || err.statusCode === 410)) dead.add(sub.endpoint)
          else console.error('push failed', err && err.statusCode)
        }
      }
    }
    if (dead.size) await putJson(SUBS_KEY, subs.filter((s) => !dead.has(s.endpoint)))
    return sent
  }

  async function runScheduled() {
    const today = istDate(now())
    const istHour = new Date(now().getTime() + 5.5 * 3600_000).getUTCHours()
    const slot = istHour < 12 ? 'morning' : 'evening'
    const month = today.slice(0, 7)
    const [card, life, journal, settings] = await Promise.all([
      getJson(`${ROOT}/statements/card/data.json`, null),
      getJson(`${ROOT}/growth/life-admin.json`, null),
      getJson(`${ROOT}/journal/${month}.json`, null),
      getJson(`${ROOT}/journal/settings.json`, null),
    ])
    const alerts = buildAlerts({
      today,
      slot,
      cardStatements: card?.statements ?? [],
      lifeItems: life?.items ?? [],
      trades: journal?.trades ?? [],
      dailyLossLimit: Number(settings?.settings?.dailyLossLimit) || 0,
    })
    return { slot, alerts: alerts.length, sent: await sendAll(alerts) }
  }

  async function route({ method, path, payload }) {
    if (!path.startsWith('/admin/push')) return null
    if (method === 'GET' && path === '/admin/push/key') return { statusCode: 200, body: { publicKey: ready ? publicKey : null } }
    const validToken = (t) => typeof t === 'string' && /^[\w:-]{20,4096}$/.test(t)
    if (method === 'POST' && path === '/admin/push/fcm/register') {
      const token = payload?.token
      if (!validToken(token)) return { statusCode: 400, body: { error: 'Invalid device token.' } }
      if (!(await fcm())) return { statusCode: 503, body: { error: 'Notifications are not set up on the server yet.' } }
      const tokens = (await getJson(FCM_TOKENS_KEY, [])).filter((t) => t !== token)
      tokens.push(token)
      await putJson(FCM_TOKENS_KEY, tokens.slice(-MAX_SUBS))
      return { statusCode: 200, body: { ok: true } }
    }
    if (method === 'POST' && path === '/admin/push/fcm/unregister') {
      const token = typeof payload?.token === 'string' ? payload.token : ''
      await putJson(FCM_TOKENS_KEY, (await getJson(FCM_TOKENS_KEY, [])).filter((t) => t !== token))
      return { statusCode: 200, body: { ok: true } }
    }
    if (method === 'POST' && path === '/admin/push/test') {
      const sent = await sendAll([{ tag: 'test', title: 'Notifications are on', body: 'You’ll get card bills, deadlines and loss-limit alerts here.', url: '/' }])
      return { statusCode: 200, body: { sent } }
    }
    if (!ready) return { statusCode: 503, body: { error: 'Notifications are not set up on the server yet.' } }
    if (method === 'POST' && path === '/admin/push/subscribe') {
      const sub = payload?.subscription
      if (!validSub(sub)) return { statusCode: 400, body: { error: 'Invalid subscription.' } }
      const subs = (await getJson(SUBS_KEY, [])).filter((s) => s.endpoint !== sub.endpoint)
      subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } })
      await putJson(SUBS_KEY, subs.slice(-MAX_SUBS))
      return { statusCode: 200, body: { ok: true } }
    }
    if (method === 'POST' && path === '/admin/push/unsubscribe') {
      const endpoint = typeof payload?.endpoint === 'string' ? payload.endpoint : ''
      await putJson(SUBS_KEY, (await getJson(SUBS_KEY, [])).filter((s) => s.endpoint !== endpoint))
      return { statusCode: 200, body: { ok: true } }
    }
    return { statusCode: 404, body: { error: 'Not found.' } }
  }

  return { route, runScheduled }
}

module.exports = { createPushApi, buildAlerts, istDate }
