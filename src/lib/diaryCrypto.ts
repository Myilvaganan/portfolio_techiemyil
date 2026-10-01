import type { CipherBox } from './growthApi'

// The diary is encrypted in the browser. A key is derived from your password or pattern (PBKDF2, 310k rounds,
// SHA-256) and used with AES-GCM; the server only ever sees ciphertext. Forget the password and nobody — including
// this app — can read the entries back.

const enc = new TextEncoder()
const dec = new TextDecoder()
const toB64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export const newSalt = () => toB64(crypto.getRandomValues(new Uint8Array(16)))

export async function deriveKey(secret: string, salt: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromB64(salt), iterations: 310_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function seal(key: CryptoKey, value: unknown): Promise<CipherBox> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)))
  return { iv: toB64(iv), ct: toB64(ct) }
}

export async function open<T>(key: CryptoKey, box: CipherBox): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.ct))
  return JSON.parse(dec.decode(pt)) as T
}

export const CHECK_VALUE = 'techiemyil-diary-v1'

/** True when the key opens the check box (i.e. the password or pattern was right). */
export async function verify(key: CryptoKey, check: CipherBox) {
  try {
    return (await open<string>(key, check)) === CHECK_VALUE
  } catch {
    return false
  }
}
