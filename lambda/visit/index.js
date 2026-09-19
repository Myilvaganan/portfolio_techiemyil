// AWS Lambda handler for site-visit and resume-download alerts on techiemyil.com.
// Deployed behind API Gateway (HTTP API) as POST /visit and POST /download.
// See README.md in this folder for deployment instructions.

const crypto = require('crypto')
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb')
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses')

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

// Resume-download alerts also go out by email via SES. Sender must be a
// verified SES identity (and, while SES is in sandbox mode, so must the
// recipient).
const ses = new SESClient({ region: process.env.SES_REGION || process.env.AWS_REGION || 'ap-south-1' })
const EMAIL_FROM = process.env.DOWNLOAD_EMAIL_FROM || 'support@techiemyil.com'
const EMAIL_TO = process.env.DOWNLOAD_EMAIL_TO || 'support@techiemyil.com'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

function getPath(event) {
  return event.rawPath || event.requestContext?.http?.path || event.path || ''
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

async function sendEmailNotification({ subject, text, replyTo }) {
  await ses.send(
    new SendEmailCommand({
      Source: EMAIL_FROM,
      Destination: { ToAddresses: [EMAIL_TO] },
      ReplyToAddresses: replyTo ? [replyTo] : undefined,
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: text, Charset: 'UTF-8' } },
      },
    })
  )
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

  const sourceIp = event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp

  if (getPath(event).replace(/\/+$/, '').endsWith('/download')) {
    return handleDownload(payload, sourceIp, respond)
  }

  const path = clean(payload.path) || '/'
  const referrer = clean(payload.referrer)
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

// Tells the site owner who is downloading the resume and why. Telegram and
// email are sent independently — the request only fails if both fail, so one
// flaky channel (e.g. SES sandbox rejecting the recipient) doesn't lose the
// alert.
async function handleDownload(payload, sourceIp, respond) {
  const name = clean(payload.name)
  if (!name) {
    return respond(400, { error: 'Name is required.' })
  }

  const rawEmail = clean(payload.email)
  const email = EMAIL_PATTERN.test(rawEmail) ? rawEmail : ''
  const reason = clean(payload.reason)
  const reasonDetail = clean(payload.reasonDetail)

  const lines = ['📄 <b>Resume downloaded</b>', `Name: ${escapeHtml(name)}`]
  lines.push(`Email: ${email ? escapeHtml(email) : 'not provided'}`)
  lines.push(`Reason: ${reason ? escapeHtml(reason) : 'not provided'}`)
  if (reasonDetail) lines.push(`Details: ${escapeHtml(reasonDetail)}`)
  if (sourceIp) lines.push(`IP: ${escapeHtml(sourceIp)}`)

  const emailLines = [
    `Name: ${name}`,
    `Email: ${email || 'not provided'}`,
    `Reason: ${reason || 'not provided'}`,
  ]
  if (reasonDetail) emailLines.push(`Details: ${reasonDetail}`)
  if (sourceIp) emailLines.push(`IP: ${sourceIp}`)

  const [telegram, mail] = await Promise.allSettled([
    sendTelegramNotification(lines.join('\n')),
    sendEmailNotification({
      // Subject is a plain SES parameter (not a raw header), but strip line
      // breaks anyway so the name can never render as multiple lines.
      subject: `Resume downloaded by ${name.replace(/\s+/g, ' ')}`,
      text: emailLines.join('\n'),
      replyTo: email,
    }),
  ])

  if (telegram.status === 'rejected') console.error('Download alert Telegram failed', telegram.reason)
  if (mail.status === 'rejected') console.error('Download alert email failed', mail.reason)

  if (telegram.status === 'rejected' && mail.status === 'rejected') {
    return respond(500, { error: 'Failed to send download alert.' })
  }
  return respond(200, { ok: true })
}
