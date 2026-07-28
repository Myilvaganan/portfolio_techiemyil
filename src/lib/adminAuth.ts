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
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRES_KEY)
}
