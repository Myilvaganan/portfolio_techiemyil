import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { createSecurityApi, verifyTotp, hotp, base32Decode, generateSecret } = require('./security.js')

function fakeS3() {
  const store = new Map()
  let v = 0
  return {
    send: async (cmd) => {
      const name = cmd.constructor.name
      const { Key, Body, IfMatch, IfNoneMatch } = cmd.input
      if (name === 'GetObjectCommand') {
        const o = store.get(Key)
        if (!o) throw Object.assign(new Error('x'), { name: 'NoSuchKey' })
        return { ETag: o.etag, Body: { transformToString: async () => o.body } }
      }
      const o = store.get(Key)
      if ((IfMatch && (!o || o.etag !== IfMatch)) || (IfNoneMatch && o)) throw Object.assign(new Error('p'), { $metadata: { httpStatusCode: 412 } })
      store.set(Key, { body: Body, etag: `"${++v}"` })
      return {}
    },
  }
}

const T0 = Date.parse('2026-09-26T10:00:00Z')
const codeAt = (secret, ms) => hotp(base32Decode(secret), Math.floor(ms / 30000))

describe('TOTP', () => {
  it('matches the RFC 6238 SHA-1 test vector', () => {
    const rfcSecret = Buffer.from('12345678901234567890')
    expect(hotp(rfcSecret, Math.floor(59 / 30)).slice(-6)).toBe('287082')
    expect(hotp(rfcSecret, Math.floor(1111111109 / 30))).toBe('081804')
  })

  it('accepts the previous, current and next step and nothing else', () => {
    const secret = generateSecret()
    expect(verifyTotp(secret, codeAt(secret, T0), T0)).not.toBeNull()
    expect(verifyTotp(secret, codeAt(secret, T0 - 30000), T0)).not.toBeNull()
    expect(verifyTotp(secret, codeAt(secret, T0 + 30000), T0)).not.toBeNull()
    expect(verifyTotp(secret, codeAt(secret, T0 + 90000), T0)).toBeNull()
    expect(verifyTotp(secret, '12345', T0)).toBeNull()
  })
})

describe('security api', () => {
  const setup = async (clock = { t: T0 }) => {
    const api = createSecurityApi({ s3: fakeS3(), bucket: 'b', secretKey: 'k', now: () => clock.t })
    const start = await api.route({ method: 'POST', path: '/admin/security/2fa/start', account: 'admin' })
    const enable = await api.route({ method: 'POST', path: '/admin/security/2fa/enable', payload: { code: codeAt(start.body.secret, clock.t) } })
    return { api, secret: start.body.secret, enable, clock }
  }

  it('does nothing at login until it is switched on', async () => {
    const api = createSecurityApi({ s3: fakeS3(), bucket: 'b', secretKey: 'k' })
    expect(await api.secondFactor('')).toBeNull()
    expect((await api.route({ method: 'GET', path: '/admin/security' })).body.enabled).toBe(false)
  })

  it('enrols with a code from the app and hands out eight one-time recovery codes', async () => {
    const { enable, api } = await setup()
    expect(enable.statusCode).toBe(200)
    expect(enable.body.recoveryCodes).toHaveLength(8)
    expect((await api.route({ method: 'GET', path: '/admin/security' })).body).toMatchObject({ enabled: true, recoveryLeft: 8 })
  })

  it('refuses to enable with a wrong code', async () => {
    const api = createSecurityApi({ s3: fakeS3(), bucket: 'b', secretKey: 'k', now: () => T0 })
    await api.route({ method: 'POST', path: '/admin/security/2fa/start' })
    expect((await api.route({ method: 'POST', path: '/admin/security/2fa/enable', payload: { code: '000000' } })).statusCode).toBe(400)
  })

  it('asks for a code at login, accepts the right one once, and rejects replays', async () => {
    const { api, secret, clock } = await setup()
    expect((await api.secondFactor('')).body.twoFactor).toBe(true)
    expect((await api.secondFactor('111111')).statusCode).toBe(401)
    clock.t += 30000
    const code = codeAt(secret, clock.t)
    expect(await api.secondFactor(code)).toBeNull()
    expect((await api.secondFactor(code)).body.error).toMatch(/just used/)
  })

  it('lets a recovery code in exactly once', async () => {
    const { api, enable } = await setup()
    const rc = enable.body.recoveryCodes[0]
    expect(await api.secondFactor(rc.toLowerCase())).toBeNull()
    expect((await api.secondFactor(rc)).statusCode).toBe(401)
    expect((await api.route({ method: 'GET', path: '/admin/security' })).body.recoveryLeft).toBe(7)
  })

  it('locks a sender out after five failures and clears the count on success', async () => {
    const { api } = await setup()
    for (let i = 0; i < 4; i++) await api.recordFailure('1.2.3.4')
    expect(await api.lockedFor('1.2.3.4')).toBe(0)
    await api.recordFailure('1.2.3.4')
    expect(await api.lockedFor('1.2.3.4')).toBeGreaterThan(0)
    expect(await api.lockedFor('5.6.7.8')).toBe(0)
    await api.recordFailure('9.9.9.9')
    await api.clearFailures('9.9.9.9')
    expect(await api.lockedFor('9.9.9.9')).toBe(0)
  })

  it('needs a valid code to turn off, and can be set up again afterwards', async () => {
    const { api, secret, clock } = await setup()
    expect((await api.route({ method: 'POST', path: '/admin/security/2fa/disable', payload: { code: '123456' } })).statusCode).toBe(400)
    clock.t += 30000
    expect((await api.route({ method: 'POST', path: '/admin/security/2fa/disable', payload: { code: codeAt(secret, clock.t) } })).body.enabled).toBe(false)
    expect((await api.route({ method: 'POST', path: '/admin/security/2fa/start' })).statusCode).toBe(200)
  })

  it('is bypassed only by the server-side emergency switch', async () => {
    const s3 = fakeS3()
    const on = createSecurityApi({ s3, bucket: 'b', secretKey: 'k', now: () => T0 })
    const st = await on.route({ method: 'POST', path: '/admin/security/2fa/start' })
    await on.route({ method: 'POST', path: '/admin/security/2fa/enable', payload: { code: codeAt(st.body.secret, T0) } })
    expect((await on.secondFactor('')).statusCode).toBe(401)
    const off = createSecurityApi({ s3, bucket: 'b', secretKey: 'k', disabled: true })
    expect(await off.secondFactor('')).toBeNull()
  })
})
