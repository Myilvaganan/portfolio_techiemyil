// A device-level app lock using the phone's own Face ID / fingerprint / screen lock (WebAuthn platform authenticator).
// It only gates the screen on this device; signing in to the vault still works as before.
const KEY = 'admin_app_lock_cred'

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export async function appLockSupported(): Promise<boolean> {
  try {
    return Boolean(window.PublicKeyCredential) && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

export function appLockEnabled(): boolean {
  try {
    return Boolean(localStorage.getItem(KEY))
  } catch {
    return false
  }
}

/** Registers this device's biometrics. Resolves true when set up. */
export async function enableAppLock(): Promise<boolean> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: random(32),
        rp: { name: 'techiemyil.com' },
        user: { id: random(16), name: 'admin', displayName: 'Admin' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null
    if (!cred) return false
    localStorage.setItem(KEY, b64(cred.rawId))
    return true
  } catch {
    return false
  }
}

export function disableAppLock() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** Asks for Face ID / fingerprint. Resolves true when the person passes. */
export async function unlockWithBiometrics(): Promise<boolean> {
  try {
    const id = localStorage.getItem(KEY)
    if (!id) return true
    const res = await navigator.credentials.get({
      publicKey: { challenge: random(32), allowCredentials: [{ type: 'public-key', id: unb64(id), transports: ['internal'] }], userVerification: 'required', timeout: 60000 },
    })
    return Boolean(res)
  } catch {
    return false
  }
}
