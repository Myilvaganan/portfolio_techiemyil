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
//   • 7 AM: the Tamil calendar daily note (panchangam, good/bad times, rasi palan)
//   • water: a separate hourly rule ({ job: 'water' }), every two hours from your start time plus a last call, nudges when you're behind the day's water target

const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const webpush = require('web-push')
const { createFcm } = require('./fcm')
const { dailyNote, starToday } = require('./panchang.gen')

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

/**
 * Pure: the water reminder for this hour, or none. Through the day the target is paced evenly between startHour and
 * endHour; a reminder goes out only when you're behind that pace, and the last run of the day says how much is left.
 */
function buildWaterAlert({ today, istHour, water }) {
  if (!water || water.reminders === false) return null
  const target = water.customMl || water.targetMl
  if (!target) return null
  const start = water.startHour ?? 8
  const end = water.endHour ?? 21
  if (istHour < start || istHour > end) return null
  const drunk = water.logs?.[today] || 0
  if (drunk >= target) return null
  const L = (ml) => `${(ml / 1000).toFixed(1)} L`
  const url = '/water'
  if (istHour >= end - 1) {
    return { tag: `water-${today}-final`, title: 'Finish your water target', body: `${L(drunk)} of ${L(target)} today — ${L(target - drunk)} to go before bed.`, url }
  }
  if ((istHour - start) % 2) return null // a nudge every two hours, not every hour
  const pace = Math.round((target * (istHour - start)) / Math.max(1, end - start))
  if (drunk >= pace - 150) return null
  return { tag: `water-${today}-${istHour}`, title: 'Time for water 💧', body: `${L(drunk)} of ${L(target)} so far — about ${L(pace - drunk)} behind. Have a glass now.`, url }
}

const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)

/** Pure: medicines due this hour that aren't ticked yet. */
function buildMedAlerts({ today, istHour, meds }) {
  if (!meds || meds.reminders === false) return []
  const taken = new Set(meds.taken?.[today] ?? [])
  const due = (meds.items ?? []).filter((m) => m.active !== false && m.hours.includes(istHour) && !taken.has(`${m.id}@${istHour}`))
  if (!due.length) return []
  return [{ tag: `meds-${today}-${istHour}`, title: '💊 Time for your medicine', body: due.map((m) => `${m.name}${m.dose ? ` · ${m.dose}` : ''}`).join('\n'), url: '/medicines' }]
}

/** Pure: family dates today, tomorrow or in three days (by English date), and star birthdays today. */
function buildFamilyAlerts({ today, people, star }) {
  const out = []
  const label = { birthday: 'birthday', anniversary: 'anniversary', memorial: 'remembrance day', other: 'day' }
  for (const p of people ?? []) {
    if (p.date) {
      for (const [n, when] of [[0, 'today'], [1, 'tomorrow'], [3, 'in 3 days']]) {
        if (addDays(today, n).slice(5) === p.date.slice(5)) {
          const years = Number(today.slice(0, 4)) - Number(p.date.slice(0, 4))
          out.push({ tag: `family-${p.id}-${today}`, title: `🎉 ${p.name}’s ${label[p.kind]} ${when}`, body: `${p.relation ? `${p.relation} · ` : ''}${years > 0 && years < 120 ? `${years} years` : p.date}`, url: '/family' })
        }
      }
    }
    if (star && p.star >= 0 && p.star === star.star && (p.tamilMonth < 0 || p.tamilMonth === star.tamilMonth)) {
      out.push({ tag: `family-star-${p.id}-${today}`, title: `🪔 ${p.name}’s star birthday today`, body: 'Their natchathiram falls today.', url: '/family' })
    }
  }
  return out
}

/** Pure: the Sunday-evening review of the last seven days. */
function buildWeeklyReview({ today, trades = [], water, habits, tasks, mood, bank = [] }) {
  const from = addDays(today, -6)
  const inWeek = (d) => d >= from && d <= today
  const wk = trades.filter((t) => inWeek(t.date))
  const net = wk.reduce((s, t) => s + netOf(t), 0)
  const target = water?.customMl || water?.targetMl || 0
  const waterDays = target ? Object.entries(water?.logs ?? {}).filter(([d, ml]) => inWeek(d) && ml >= target).length : 0
  const habitTicks = Object.entries(habits?.checks ?? {}).filter(([d]) => inWeek(d)).reduce((s, [, v]) => s + v.length, 0)
  const tasksDone = (tasks?.tasks ?? []).filter((t) => t.done && inWeek(t.doneOn)).length
  const focus = (tasks?.sessions ?? []).filter((x) => inWeek(x.date)).reduce((s, x) => s + x.minutes, 0)
  const sleeps = Object.entries(mood?.days ?? {}).filter(([d, v]) => inWeek(d) && v.sleepH > 0).map(([, v]) => v.sleepH)
  const avgSleep = sleeps.length ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length : 0
  const spend = bank.filter((t) => inWeek(t.date)).reduce((s, t) => s + (t.debit || 0), 0)
  const lines = [
    wk.length ? `Trading: ${net < 0 ? "−" : "+"}${inr(Math.abs(net))} across ${wk.length} trades` : 'Trading: no trades',
    spend ? `Spent ${inr(spend)} from the bank` : null,
    `Focus ${Math.floor(focus / 60)}h ${focus % 60}m · ${tasksDone} tasks done`,
    `Habits ticked ${habitTicks}× · water target met ${waterDays}/7 days`,
    avgSleep ? `Sleep ${avgSleep.toFixed(1)}h a night` : null,
  ].filter(Boolean)
  const tip = net < 0 ? 'Next week: trade only your A+ setups and stop at the daily limit.' : avgSleep && avgSleep < 6.5 ? 'Next week: protect your sleep — aim for 7 hours.' : waterDays < 4 && target ? 'Next week: keep a bottle at your desk and hit your water target.' : focus < 300 ? 'Next week: book one 25-minute focus block every morning.' : 'Great week — keep the streak going.'
  return { tag: `weekly-${today}`, title: '📊 Your week in review', body: `${lines.join('\n')}\n${tip}`, url: '/monthly-review' }
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

  async function runWater() {
    const t = now()
    const today = istDate(t)
    const istHour = new Date(t.getTime() + 5.5 * 3600_000).getUTCHours()
    const [water, calendar] = await Promise.all([getJson(`${ROOT}/growth/water.json`, null), getJson(`${ROOT}/growth/calendar.json`, null)])
    const alerts = []
    // 7 AM: the day's Tamil calendar note — the date, anything special, good and bad times, rasi palan, a fresh line.
    if (istHour === 7 && calendar?.notify !== false) {
      try {
        alerts.push(dailyNote(today, { place: calendar?.place || 'Chennai', rasi: calendar?.rasi ?? -1, star: calendar?.star ?? -1, notify: true }))
      } catch (err) {
        console.error('calendar note failed', err)
      }
    }
    const [meds, family] = await Promise.all([getJson(`${ROOT}/growth/meds.json`, null), istHour === 7 ? getJson(`${ROOT}/growth/family.json`, null) : null])
    alerts.push(...buildMedAlerts({ today, istHour, meds }))
    if (istHour === 7 && family?.people?.length) {
      let star = null
      try {
        star = starToday(today, calendar?.place || 'Chennai')
      } catch (err) {
        console.error('star lookup failed', err)
      }
      alerts.push(...buildFamilyAlerts({ today, people: family.people, star }))
    }
    // Sunday 7 PM: the week in review.
    if (istHour === 19 && new Date(`${today}T00:00:00Z`).getUTCDay() === 0) {
      const months = [...new Set([today.slice(0, 7), addDays(today, -6).slice(0, 7)])]
      const [journals, habits, tasks, mood, bank] = await Promise.all([
        Promise.all(months.map((m) => getJson(`${ROOT}/journal/${m}.json`, null))),
        getJson(`${ROOT}/growth/habits.json`, null),
        getJson(`${ROOT}/growth/tasks.json`, null),
        getJson(`${ROOT}/growth/mood.json`, null),
        getJson(`${ROOT}/statements/bank/data.json`, null),
      ])
      alerts.push(buildWeeklyReview({ today, trades: journals.flatMap((j) => j?.trades ?? []), water, habits, tasks, mood, bank: bank?.transactions ?? [] }))
    }
    const water1 = buildWaterAlert({ today, istHour, water })
    if (water1) alerts.push(water1)
    return { job: 'water', sent: alerts.length ? await sendAll(alerts) : 0 }
  }

  async function runScheduled(event) {
    if (event?.job === 'water') return runWater()
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

module.exports = { createPushApi, buildAlerts, buildWaterAlert, buildMedAlerts, buildFamilyAlerts, buildWeeklyReview, istDate }
