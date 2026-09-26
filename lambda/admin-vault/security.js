// Two-factor sign-in (TOTP, RFC 6238) and login throttling for the admin.
//
//   GET  /admin/security                     { enabled, recoveryLeft, lockoutAfter }
//   POST /admin/security/2fa/start           { secret, uri }          begins enrolment (nothing changes until it is confirmed)
//   POST /admin/security/2fa/enable  {code}  { recoveryCodes }        confirms with a code from the authenticator app
//   POST /admin/security/2fa/disable {code}  { enabled: false }       needs a current code (or a recovery code)
//   POST /admin/security/2fa/recovery {code} { recoveryCodes }        replaces the recovery codes
//
// State lives in _data/security/2fa.json. The authenticator secret is encrypted at rest with AES-256-GCM (key derived from
// ADMIN_2FA_KEY, falling back to the session secret). Recovery codes are stored only as hashes and work once. A code can't be
// used twice (the last accepted time step is remembered) and repeated failures lock a sender out for a while.
// Emergency exit if the authenticator is lost and no recovery code is left: set ADMIN_2FA_DISABLED=1 on the function.

const crypto = require('crypto')
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')

const STATE_KEY = '_data/security/2fa.json'
const ATTEMPTS_KEY = '_data/security/attempts.json'
const STEP_SECONDS = 30
const DIGITS = 6
const WINDOW = 1
const RECOVERY_CODES = 8
const MAX_FAILURES = 5
const LOCK_MS = 15 * 60_000
const ISSUER = 'Techie Myil Admin'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buf) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

function hotp(secret, counter) {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = crypto.createHmac('sha1', secret).update(msg).digest()
  const off = h[h.length - 1] & 15
  const n = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(n % 10 ** DIGITS).padStart(DIGITS, '0')
}

const stepOf = (ms) => Math.floor(ms / 1000 / STEP_SECONDS)

/** The time step a code belongs to (within one step either side of `now`), or null if it doesn't match. */
function verifyTotp(secretB32, code, nowMs = Date.now()) {
  const clean = String(code || '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return null
  const secret = base32Decode(secretB32)
  const current = stepOf(nowMs)
  for (let s = current - WINDOW; s <= current + WINDOW; s++) {
    const expected = hotp(secret, s)
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return s
  }
  return null
}

const generateSecret = () => base32Encode(crypto.randomBytes(20))
const otpauthUri = (secret, account) => `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex')
const normalizeRecovery = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

function newRecoveryCodes() {
  const pretty = []
  for (let i = 0; i < RECOVERY_CODES; i++) {
    const raw = base32Encode(crypto.randomBytes(7)).slice(0, 10)
    pretty.push(`${raw.slice(0, 5)}-${raw.slice(5)}`)
  }
  return { pretty, hashes: pretty.map((c) => sha(normalizeRecovery(c))) }
}

function createSecurityApi({ s3, bucket, secretKey, disabled = false, now = () => Date.now() }) {
  const key = crypto.createHash('sha256').update(`2fa:${secretKey || ''}`).digest()

  const seal = (plain) => {
    const iv = crypto.randomBytes(12)
    const c = crypto.createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
    return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`
  }
  const open = (sealed) => {
    const [iv, tag, enc] = String(sealed).split('.').map((p) => Buffer.from(p, 'base64'))
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
  }

  async function readJson(k) {
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: k }))
      return { data: JSON.parse(await out.Body.transformToString()), etag: out.ETag }
    } catch (err) {
      if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) return { data: null, etag: null }
      throw err
    }
  }

  // Conditional read-modify-write, retried when another request changed the file in between.
  async function update(k, change) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, etag } = await readJson(k)
      const next = change(data)
      try {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: k, Body: JSON.stringify(next), ContentType: 'application/json', ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }) }))
        return next
      } catch (err) {
        const status = err && err.$metadata && err.$metadata.httpStatusCode
        if (status !== 412 && status !== 409 && !(err && err.name === 'PreconditionFailed')) throw err
      }
    }
    throw new Error('Too many concurrent updates.')
  }

  const emptyState = () => ({ enabled: false, secret: null, pending: null, lastStep: 0, recovery: [], enabledAt: null })
  const getState = async () => ({ ...emptyState(), ...((await readJson(STATE_KEY)).data || {}) })

  // ----- Login throttling (per sender, hashed) -----
  const who = (ip) => sha(`ip:${ip || 'unknown'}`).slice(0, 24)

  async function lockedFor(ip) {
    const { data } = await readJson(ATTEMPTS_KEY)
    const a = data && data[who(ip)]
    return a && a.lockedUntil > now() ? Math.ceil((a.lockedUntil - now()) / 60_000) : 0
  }

  async function recordFailure(ip) {
    const id = who(ip)
    await update(ATTEMPTS_KEY, (data) => {
      const all = { ...(data || {}) }
      const t = now()
      // Forget senders that have been quiet for a day so the file stays small.
      for (const [k, v] of Object.entries(all)) if (t - (v.last || 0) > 86_400_000) delete all[k]
      const cur = all[id] && t - all[id].first < LOCK_MS ? all[id] : { count: 0, first: t }
      const count = cur.count + 1
      all[id] = { count, first: cur.first, last: t, lockedUntil: count >= MAX_FAILURES ? t + LOCK_MS : 0 }
      return all
    })
  }

  async function clearFailures(ip) {
    const id = who(ip)
    const { data } = await readJson(ATTEMPTS_KEY)
    if (!data || !data[id]) return
    await update(ATTEMPTS_KEY, (d) => {
      const all = { ...(d || {}) }
      delete all[id]
      return all
    })
  }

  // ----- Checking a code (used by login and by the security routes) -----
  /** A code from the authenticator app or an unused recovery code. Returns { ok, used? }. */
  async function checkCode(code) {
    const st = await getState()
    if (!st.enabled || !st.secret) return { ok: true, used: 'none' }
    let secret
    try {
      secret = open(st.secret)
    } catch {
      return { ok: false, broken: true }
    }
    const step = verifyTotp(secret, code, now())
    if (step !== null) {
      if (step <= st.lastStep) return { ok: false, replay: true }
      await update(STATE_KEY, (d) => ({ ...emptyState(), ...(d || {}), lastStep: Math.max((d && d.lastStep) || 0, step) }))
      return { ok: true, used: 'app' }
    }
    const h = sha(normalizeRecovery(code))
    if (normalizeRecovery(code).length === 10 && st.recovery.includes(h)) {
      await update(STATE_KEY, (d) => ({ ...emptyState(), ...(d || {}), recovery: ((d && d.recovery) || []).filter((x) => x !== h) }))
      return { ok: true, used: 'recovery' }
    }
    return { ok: false }
  }

  /**
   * Called by the login handler after the password is right. Returns null when sign-in may continue, or a response.
   */
  async function secondFactor(code) {
    if (disabled) return null
    const st = await getState()
    if (!st.enabled) return null
    if (!String(code || '').trim()) return { statusCode: 401, body: { error: 'Enter the 6-digit code from your authenticator app.', twoFactor: true } }
    const r = await checkCode(code)
    if (r.ok) return null
    if (r.broken) return { statusCode: 500, body: { error: 'Two-factor sign-in is misconfigured. Use a recovery step from the README.' } }
    return { statusCode: 401, body: { error: r.replay ? 'That code was just used. Wait for the next one.' : 'That code is not right.', twoFactor: true } }
  }

  // ----- Routes -----
  async function status() {
    const st = await getState()
    return { statusCode: 200, body: { enabled: st.enabled && !disabled, recoveryLeft: st.recovery.length, enabledAt: st.enabledAt, disabledByServer: disabled, maxFailures: MAX_FAILURES, lockMinutes: LOCK_MS / 60_000 } }
  }

  async function start(account) {
    const st = await getState()
    if (st.enabled) return { statusCode: 409, body: { error: 'Two-factor sign-in is already on. Turn it off first to set it up again.' } }
    const secret = generateSecret()
    await update(STATE_KEY, (d) => ({ ...emptyState(), ...(d || {}), pending: seal(secret) }))
    return { statusCode: 200, body: { secret, uri: otpauthUri(secret, account || 'admin') } }
  }

  async function enable(payload) {
    const st = await getState()
    if (st.enabled) return { statusCode: 409, body: { error: 'Two-factor sign-in is already on.' } }
    if (!st.pending) return { statusCode: 400, body: { error: 'Start the setup first.' } }
    const secret = open(st.pending)
    const step = verifyTotp(secret, payload && payload.code, now())
    if (step === null) return { statusCode: 400, body: { error: 'That code is not right. Check the code in your app and try again.' } }
    const { pretty, hashes } = newRecoveryCodes()
    await update(STATE_KEY, (d) => ({ ...emptyState(), ...(d || {}), enabled: true, secret: seal(secret), pending: null, lastStep: step, recovery: hashes, enabledAt: new Date(now()).toISOString() }))
    return { statusCode: 200, body: { enabled: true, recoveryCodes: pretty } }
  }

  async function disable(payload) {
    const r = await checkCode(payload && payload.code)
    if (!r.ok) return { statusCode: 400, body: { error: 'That code is not right.' } }
    await update(STATE_KEY, () => emptyState())
    return { statusCode: 200, body: { enabled: false } }
  }

  async function regenerate(payload) {
    const st = await getState()
    if (!st.enabled) return { statusCode: 400, body: { error: 'Two-factor sign-in is off.' } }
    const r = await checkCode(payload && payload.code)
    if (!r.ok) return { statusCode: 400, body: { error: 'That code is not right.' } }
    const { pretty, hashes } = newRecoveryCodes()
    await update(STATE_KEY, (d) => ({ ...emptyState(), ...(d || {}), recovery: hashes }))
    return { statusCode: 200, body: { recoveryCodes: pretty } }
  }

  async function route({ method, path, payload, account }) {
    if (method === 'GET' && path === '/admin/security') return status()
    if (method === 'POST' && path === '/admin/security/2fa/start') return start(account)
    if (method === 'POST' && path === '/admin/security/2fa/enable') return enable(payload)
    if (method === 'POST' && path === '/admin/security/2fa/disable') return disable(payload)
    if (method === 'POST' && path === '/admin/security/2fa/recovery') return regenerate(payload)
    return null
  }

  return { route, secondFactor, lockedFor, recordFailure, clearFailures }
}

module.exports = { createSecurityApi, verifyTotp, generateSecret, base32Decode, base32Encode, hotp, otpauthUri, normalizeRecovery }
