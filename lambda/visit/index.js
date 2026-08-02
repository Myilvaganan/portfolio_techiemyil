// AWS Lambda handler for site-visit alerts on techiemyil.com.
// Deployed behind API Gateway (HTTP API) as a single POST route.
// See README.md in this folder for deployment instructions.

const crypto = require('crypto')
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb')

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID
// Comma-separated list, e.g. "https://techiemyil.com,https://www.techiemyil.com".
// Falls back to "*" (any origin) if unset.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
const MAX_FIELD_LENGTH = 300

// Server-side dedup so a new device always gets one alert per day even if
// the client-side localStorage gate (src/lib/visit.ts) is bypassed by
// incognito mode or cleared site data. Keyed by IP + User-Agent rather than
// IP alone, so multiple devices behind the same NAT/router still each count
// as "new".
const DEDUP_TABLE = process.env.VISIT_DEDUP_TABLE || 'visit-dedup'
const DEDUP_TTL_SECONDS = 2 * 24 * 60 * 60
const ddb = new DynamoDBClient({})

function resolveOrigin(requestOrigin) {
  if (ALLOWED_ORIGINS.includes('*')) return '*'
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin
  return ALLOWED_ORIGINS[0] || '*'
}

function corsHeaders(requestOrigin) {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(requestOrigin),
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

function getMethod(event) {
  return event.requestContext?.http?.method || event.httpMethod || 'POST'
}

function getOrigin(event) {
  const headers = event.headers || {}
  return headers.origin || headers.Origin
}

function clean(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_FIELD_LENGTH) : ''
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function getUserAgent(event) {
  const headers = event.headers || {}
  return headers['user-agent'] || headers['User-Agent'] || ''
}

// Resolves true only the first time this IP+User-Agent pair is seen today.
// Fails open (treats as new) on DynamoDB errors, since a missed dedup just
// means an extra Telegram message, while a false negative would silently
// drop a real visit alert.
async function isNewDeviceToday(sourceIp, userAgent) {
  const today = new Date().toISOString().slice(0, 10)
  const fingerprint = crypto.createHash('sha256').update(`${sourceIp}|${userAgent}`).digest('hex')
  const expiresAt = Math.floor(Date.now() / 1000) + DEDUP_TTL_SECONDS

  try {
    await ddb.send(
      new PutItemCommand({
        TableName: DEDUP_TABLE,
        Item: { pk: { S: `${fingerprint}#${today}` }, expiresAt: { N: String(expiresAt) } },
        ConditionExpression: 'attribute_not_exists(pk)',
      })
    )
    return true
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return false
    console.error('Visit dedup check failed, notifying anyway', err)
    return true
  }
}

async function sendTelegramNotification(text) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
  })

  if (!res.ok) {
    throw new Error(`Telegram send failed (${res.status}): ${await res.text()}`)
  }
}

exports.handler = async (event) => {
  const method = getMethod(event)
  const origin = getOrigin(event)

  function respond(statusCode, body) {
    return {
      statusCode,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      body: JSON.stringify(body),
    }
  }

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' }
  }

  if (method !== 'POST') {
    return respond(405, { error: 'Method not allowed.' })
  }

  if (!BOT_TOKEN || !CHAT_ID) {
    console.error('Visit alert misconfigured: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set')
    return respond(500, { error: 'Visit alerts are not configured yet.' })
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return respond(400, { error: 'Invalid request body.' })
  }

  const path = clean(payload.path) || '/'
  const referrer = clean(payload.referrer)
  const sourceIp = event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp
  const userAgent = getUserAgent(event)

  if (!(await isNewDeviceToday(sourceIp, userAgent))) {
    return respond(200, { ok: true, deduped: true })
  }

  const lines = [
    '👀 <b>New visitor on techiemyil.com</b>',
    `Page: ${escapeHtml(path)}`,
  ]
  if (referrer) lines.push(`Referrer: ${escapeHtml(referrer)}`)
  if (sourceIp) lines.push(`IP: ${escapeHtml(sourceIp)}`)

  try {
    await sendTelegramNotification(lines.join('\n'))
    return respond(200, { ok: true })
  } catch (err) {
    console.error('Visit alert handler error', err)
    return respond(500, { error: 'Failed to send visit alert.' })
  }
}
