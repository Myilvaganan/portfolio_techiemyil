// Firebase Cloud Messaging (HTTP v1) for the Android app, with no SDK: a service-account JWT is exchanged for an
// OAuth token, which is cached until shortly before it expires.

const crypto = require('crypto')

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')

function createFcm({ serviceAccount, fetchImpl = fetch, now = () => Date.now() }) {
  let cached = null

  async function accessToken() {
    if (cached && cached.expires > now() + 60_000) return cached.token
    const iat = Math.floor(now() / 1000)
    const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iss: serviceAccount.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 })}`
    const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(serviceAccount.private_key, 'base64url')
    const res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`FCM auth failed: ${data.error || res.status}`)
    cached = { token: data.access_token, expires: now() + data.expires_in * 1000 }
    return cached.token
  }

  /** Send one alert to one device. Returns 'ok', 'gone' (token no longer valid) or 'error'. */
  async function send(token, alert) {
    const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await accessToken()}` },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: alert.title, body: alert.body },
          data: { url: alert.url || '/', tag: alert.tag || '' },
          android: { ttl: '21600s', notification: { tag: alert.tag || undefined } },
        },
      }),
    })
    if (res.ok) return 'ok'
    const err = await res.json().catch(() => ({}))
    const status = err.error?.status
    if (res.status === 404 || status === 'NOT_FOUND' || status === 'UNREGISTERED') return 'gone'
    console.error('fcm send failed', res.status, status)
    return 'error'
  }

  return { send }
}

module.exports = { createFcm }
