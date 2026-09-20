// AWS Lambda handler for the /admin document vault on techiemyil.com.
// Deployed behind API Gateway (HTTP API, $default route) — a tiny router
// dispatches on method + path since every operation lives in one function.
// See README.md in this folder for deployment instructions.

const crypto = require('crypto')
const { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

const ADMIN_USERNAME = process.env.ADMIN_USERNAME
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const JWT_SECRET = process.env.ADMIN_JWT_SECRET
const S3_BUCKET = process.env.S3_BUCKET
const KITE_API_KEY = process.env.KITE_API_KEY
const KITE_API_SECRET = process.env.KITE_API_SECRET
// Comma-separated list, e.g. "https://techiemyil.com,https://www.techiemyil.com".
// Falls back to "*" (any origin) if unset.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const UPLOAD_URL_TTL_SECONDS = 300 // 5 min
const DOWNLOAD_URL_TTL_SECONDS = 120 // 2 min
const MAX_FILENAME_LENGTH = 150
const MAX_TAG_LENGTH = 40

const s3 = new S3Client({})

// ---------- CORS / request helpers ----------

function resolveOrigin(requestOrigin) {
  if (ALLOWED_ORIGINS.includes('*')) return '*'
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin
  return ALLOWED_ORIGINS[0] || '*'
}

function corsHeaders(requestOrigin) {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(requestOrigin),
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    Vary: 'Origin',
  }
}

function getMethod(event) {
  return event.requestContext?.http?.method || event.httpMethod || 'GET'
}

function getPath(event) {
  return event.rawPath || event.requestContext?.http?.path || event.path || '/'
}

function getOrigin(event) {
  const headers = event.headers || {}
  return headers.origin || headers.Origin
}

function getAuthHeader(event) {
  const headers = event.headers || {}
  return headers.authorization || headers.Authorization
}

// ---------- Session tokens (HMAC-signed, no external JWT dependency) ----------

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function signToken(payload) {
  const headerB64 = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = base64url(JSON.stringify(payload))
  const data = `${headerB64}.${payloadB64}`
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest()
  return `${data}.${base64url(signature)}`
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, signatureB64] = parts
  const data = `${headerB64}.${payloadB64}`
  const expectedSignature = base64url(crypto.createHmac('sha256', JWT_SECRET).update(data).digest())

  const actualBuf = Buffer.from(signatureB64)
  const expectedBuf = Buffer.from(expectedSignature)
  if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    return null
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'))
  } catch {
    return null
  }
  if (!payload || typeof payload.exp !== 'number' || Date.now() >= payload.exp) return null
  return payload
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a ?? ''))
  const bBuf = Buffer.from(String(b ?? ''))
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

function requireAuth(event) {
  const authHeader = getAuthHeader(event)
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  return verifyToken(authHeader.slice('Bearer '.length))
}

// ---------- Key encoding: `{tag}/{iso-timestamp}__{filename}`, no database needed ----------

function slugifyTag(tag) {
  const slug = String(tag || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TAG_LENGTH)
  return slug || 'other'
}

function sanitizeFilename(name) {
  const cleaned = String(name || 'file')
    .replace(/[/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH)
  return cleaned || 'file'
}

function buildKey(tag, filename) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${slugifyTag(tag)}/${timestamp}__${sanitizeFilename(filename)}`
}

function parseKey(key) {
  const slashIdx = key.indexOf('/')
  const tag = slashIdx === -1 ? 'other' : key.slice(0, slashIdx)
  const rest = slashIdx === -1 ? key : key.slice(slashIdx + 1)
  const sepIdx = rest.indexOf('__')
  const filename = sepIdx === -1 ? rest : rest.slice(sepIdx + 2)
  return { tag, filename: filename || rest }
}

// A valid key is always `{slug}/{something}` with no path traversal.
function isValidKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length < 1024 && !key.includes('..') && key.includes('/') && !key.startsWith('/')
}

// ---------- Route handlers ----------

async function handleLogin(payload) {
  const username = typeof payload.username === 'string' ? payload.username : ''
  const password = typeof payload.password === 'string' ? payload.password : ''

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !JWT_SECRET) {
    console.error('admin-vault misconfigured: ADMIN_USERNAME/ADMIN_PASSWORD/ADMIN_JWT_SECRET not set')
    return { statusCode: 500, body: { error: 'Admin login is not configured yet.' } }
  }

  if (!safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
    return { statusCode: 401, body: { error: 'Invalid username or password.' } }
  }

  const now = Date.now()
  const token = signToken({ sub: username, iat: now, exp: now + SESSION_TTL_MS })
  return { statusCode: 200, body: { token, expiresAt: now + SESSION_TTL_MS } }
}

async function handleListDocuments() {
  const out = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET }))
  const documents = (out.Contents || [])
    .filter((obj) => obj.Key && !obj.Key.endsWith('/'))
    .map((obj) => {
      const { tag, filename } = parseKey(obj.Key)
      return {
        key: obj.Key,
        tag,
        filename,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ? new Date(obj.LastModified).toISOString() : null,
      }
    })
    .sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''))

  return { statusCode: 200, body: { documents } }
}

async function handleUploadUrl(payload) {
  const filename = typeof payload.filename === 'string' ? payload.filename : ''
  const tag = typeof payload.tag === 'string' ? payload.tag : ''
  const contentType = typeof payload.contentType === 'string' ? payload.contentType : 'application/octet-stream'

  if (!filename.trim()) {
    return { statusCode: 400, body: { error: 'A filename is required.' } }
  }

  const key = buildKey(tag, filename)
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  )

  return { statusCode: 200, body: { uploadUrl, key } }
}

async function handleDownloadUrl(queryParams) {
  const key = queryParams.key
  const mode = queryParams.mode === 'download' ? 'download' : 'preview'

  if (!isValidKey(key)) {
    return { statusCode: 400, body: { error: 'A valid document key is required.' } }
  }

  const { filename } = parseKey(key)
  const disposition = mode === 'download' ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key, ResponseContentDisposition: disposition }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  )

  return { statusCode: 200, body: { url } }
}

async function handleDeleteDocument(queryParams) {
  const key = queryParams.key

  if (!isValidKey(key)) {
    return { statusCode: 400, body: { error: 'A valid document key is required.' } }
  }

  await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }))
  return { statusCode: 200, body: { ok: true } }
}

// ---------- Zerodha Kite Connect proxy ----------
// Kite's API sends no CORS headers and the token exchange needs the API secret,
// so the browser can only reach it through this function. The access token is
// never stored here: the browser keeps it for the day and sends it with each
// request. Never log it.

const KITE_BASE = 'https://api.kite.trade'
const KITE_LOGIN = 'https://kite.zerodha.com/connect/login'

const KITE_SNAPSHOT_RESOURCES = {
  profile: '/user/profile',
  margins: '/user/margins',
  holdings: '/portfolio/holdings',
  positions: '/portfolio/positions',
  orders: '/orders',
}

function kiteConfigured() {
  return Boolean(KITE_API_KEY && KITE_API_SECRET)
}

async function kiteRequest(path, { method = 'GET', accessToken, form } = {}) {
  const headers = { 'X-Kite-Version': '3' }
  if (accessToken) headers.Authorization = `token ${KITE_API_KEY}:${accessToken}`
  let body
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(form).toString()
  }
  const res = await fetch(`${KITE_BASE}${path}`, { method, headers, body })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json || json.status !== 'success') {
    const err = new Error((json && json.message) || `Kite request failed (${res.status})`)
    err.kiteType = json && json.error_type
    err.httpStatus = res.status
    throw err
  }
  return json.data
}

function isKiteTokenError(err) {
  return err && (err.kiteType === 'TokenException' || err.httpStatus === 403)
}

function kiteNotConfigured() {
  return { statusCode: 500, body: { error: 'Zerodha is not configured yet (KITE_API_KEY / KITE_API_SECRET).' } }
}

async function handleKiteLoginUrl() {
  if (!kiteConfigured()) return kiteNotConfigured()
  const url = `${KITE_LOGIN}?v=3&api_key=${encodeURIComponent(KITE_API_KEY)}`
  return { statusCode: 200, body: { url } }
}

async function handleKiteSession(payload) {
  if (!kiteConfigured()) return kiteNotConfigured()
  const requestToken = typeof payload.requestToken === 'string' ? payload.requestToken.trim() : ''
  if (!requestToken) return { statusCode: 400, body: { error: 'A request token is required.' } }

  const checksum = crypto.createHash('sha256').update(`${KITE_API_KEY}${requestToken}${KITE_API_SECRET}`).digest('hex')
  try {
    const data = await kiteRequest('/session/token', {
      method: 'POST',
      form: { api_key: KITE_API_KEY, request_token: requestToken, checksum },
    })
    return {
      statusCode: 200,
      body: {
        accessToken: data.access_token,
        userId: data.user_id,
        userName: data.user_name || data.user_shortname || data.user_id,
        email: data.email,
        loginTime: data.login_time,
      },
    }
  } catch (err) {
    console.error('kite session exchange failed', err.kiteType || '', err.message)
    return { statusCode: 401, body: { error: 'Zerodha login failed. Please try connecting again.' } }
  }
}

async function handleKiteSnapshot(payload) {
  if (!kiteConfigured()) return kiteNotConfigured()
  const accessToken = typeof payload.accessToken === 'string' ? payload.accessToken : ''
  if (!accessToken) return { statusCode: 400, body: { error: 'An access token is required.' } }

  const entries = Object.entries(KITE_SNAPSHOT_RESOURCES)
  const results = await Promise.allSettled(entries.map(([, path]) => kiteRequest(path, { accessToken })))

  if (results.some((r) => r.status === 'rejected' && isKiteTokenError(r.reason))) {
    return { statusCode: 403, body: { error: 'Your Zerodha session has expired. Please reconnect.', code: 'token_expired' } }
  }

  const snapshot = { fetchedAt: new Date().toISOString(), errors: {} }
  entries.forEach(([name], i) => {
    const r = results[i]
    if (r.status === 'fulfilled') snapshot[name] = r.value
    else {
      snapshot[name] = null
      snapshot.errors[name] = r.reason.message
    }
  })

  if (results.every((r) => r.status === 'rejected')) {
    return { statusCode: 502, body: { error: 'Could not reach Zerodha. Please try again shortly.' } }
  }
  return { statusCode: 200, body: snapshot }
}

async function handleKiteLogout(payload) {
  if (!kiteConfigured()) return kiteNotConfigured()
  const accessToken = typeof payload.accessToken === 'string' ? payload.accessToken : ''
  if (accessToken) {
    try {
      await kiteRequest(
        `/session/token?api_key=${encodeURIComponent(KITE_API_KEY)}&access_token=${encodeURIComponent(accessToken)}`,
        { method: 'DELETE' },
      )
    } catch {
      // Already expired or invalid — nothing left to revoke.
    }
  }
  return { statusCode: 200, body: { ok: true } }
}

// ---------- Entry point ----------

exports.handler = async (event) => {
  const method = getMethod(event)
  const path = getPath(event)
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

  if (!S3_BUCKET) {
    console.error('admin-vault misconfigured: S3_BUCKET not set')
    return respond(500, { error: 'Admin vault is not configured yet.' })
  }

  let payload = {}
  if (method === 'POST') {
    try {
      payload = JSON.parse(event.body || '{}')
    } catch {
      return respond(400, { error: 'Invalid request body.' })
    }
  }
  const queryParams = event.queryStringParameters || {}

  try {
    if (method === 'POST' && path === '/admin/login') {
      const result = await handleLogin(payload)
      return respond(result.statusCode, result.body)
    }

    // Every other route requires a valid session token.
    const session = requireAuth(event)
    if (!session) {
      return respond(401, { error: 'Not authenticated.' })
    }

    if (method === 'GET' && path === '/admin/documents') {
      const result = await handleListDocuments()
      return respond(result.statusCode, result.body)
    }

    if (method === 'POST' && path === '/admin/documents/upload-url') {
      const result = await handleUploadUrl(payload)
      return respond(result.statusCode, result.body)
    }

    if (method === 'GET' && path === '/admin/documents/download-url') {
      const result = await handleDownloadUrl(queryParams)
      return respond(result.statusCode, result.body)
    }

    if (method === 'DELETE' && path === '/admin/documents') {
      const result = await handleDeleteDocument(queryParams)
      return respond(result.statusCode, result.body)
    }

    if (method === 'GET' && path === '/admin/kite/login-url') {
      const result = await handleKiteLoginUrl()
      return respond(result.statusCode, result.body)
    }

    if (method === 'POST' && path === '/admin/kite/session') {
      const result = await handleKiteSession(payload)
      return respond(result.statusCode, result.body)
    }

    if (method === 'POST' && path === '/admin/kite/snapshot') {
      const result = await handleKiteSnapshot(payload)
      return respond(result.statusCode, result.body)
    }

    if (method === 'POST' && path === '/admin/kite/logout') {
      const result = await handleKiteLogout(payload)
      return respond(result.statusCode, result.body)
    }

    return respond(404, { error: 'Not found.' })
  } catch (err) {
    console.error('admin-vault handler error', err)
    return respond(500, { error: 'Something went wrong. Please try again.' })
  }
}
