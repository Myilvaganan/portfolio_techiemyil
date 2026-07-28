// AWS Lambda handler for the /admin document vault on techiemyil.com.
// Deployed behind API Gateway (HTTP API, $default route) — a tiny router
// dispatches on method + path since every operation lives in one function.
// See README.md in this folder for deployment instructions.

const crypto = require('crypto')
const { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

const ADMIN_USERNAME = process.env.ADMIN_USERNAME
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const JWT_SECRET = process.env.ADMIN_JWT_SECRET
const S3_BUCKET = process.env.S3_BUCKET
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
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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

    return respond(404, { error: 'Not found.' })
  } catch (err) {
    console.error('admin-vault handler error', err)
    return respond(500, { error: 'Something went wrong. Please try again.' })
  }
}
