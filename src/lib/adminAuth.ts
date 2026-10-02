const TOKEN_KEY = 'admin_vault_token'
const EXPIRES_KEY = 'admin_vault_token_expires'

export function getStoredToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY)
  const expiresAt = Number(localStorage.getItem(EXPIRES_KEY))

  if (!token || !expiresAt || Date.now() >= expiresAt) {
    clearStoredToken()
    return null
  }

  return token
}

export function storeToken(token: string, expiresAt: number) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(EXPIRES_KEY, String(expiresAt))
}

export function clearStoredToken() {
  // Offline copies of vault data must not outlive the session.
  if (typeof caches !== 'undefined') void caches.delete('vault-api').catch(() => {})
  const had = Boolean(localStorage.getItem(TOKEN_KEY))
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRES_KEY)
  // Tell the app, so it shows the sign-in screen instead of carrying on with every request failing.
  if (had && typeof window !== 'undefined') window.dispatchEvent(new Event('admin:signed-out'))
}
