import { clearStoredToken, getStoredToken, storeToken } from './adminAuth'

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL

export interface VaultDocument {
  key: string
  tag: string
  filename: string
  size: number
  lastModified: string | null
}

async function adminFetch(path: string, init: RequestInit = {}) {
  const token = getStoredToken()
  const res = await fetch(`${ADMIN_API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  if (res.status === 401) clearStoredToken()

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error || 'Something went wrong. Please try again.')
  }
  return data
}

export async function loginAdmin(username: string, password: string) {
  const res = await fetch(`${ADMIN_API_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await res.json().catch(() => null)

  if (!res.ok || typeof data?.token !== 'string') {
    throw new Error(data?.error || 'Login failed. Please try again.')
  }

  storeToken(data.token, data.expiresAt)
}

export async function listDocuments(): Promise<VaultDocument[]> {
  const data = await adminFetch('/admin/documents')
  return data.documents
}

export async function getUploadUrl(filename: string, tag: string, contentType: string) {
  const data = await adminFetch('/admin/documents/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, tag, contentType }),
  })
  return { uploadUrl: data.uploadUrl as string, key: data.key as string }
}

export async function getDownloadUrl(key: string, mode: 'preview' | 'download'): Promise<string> {
  const data = await adminFetch(`/admin/documents/download-url?key=${encodeURIComponent(key)}&mode=${mode}`)
  return data.url
}

export async function uploadFile(uploadUrl: string, file: File) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!res.ok) throw new Error('Upload failed. Please try again.')
}
