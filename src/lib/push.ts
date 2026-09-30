import { useCallback, useEffect, useState } from 'react'
import { clearStoredToken, getStoredToken } from './adminAuth'

const API = import.meta.env.VITE_ADMIN_API_URL

async function call(path: string, body?: unknown) {
  const token = getStoredToken()
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) clearStoredToken()
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || 'Could not reach the server.')
  return data
}

const toKey = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** Notifications on this device: state, and turning them on/off (asks for permission the first time). */
export function usePush() {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pushSupported()) return
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setEnabled(Boolean(s) && Notification.permission === 'granted')).catch(() => {})
  }, [])

  const enable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked for this site in Chrome settings.')
      const { publicKey } = await call('/admin/push/key')
      if (!publicKey) throw new Error('Notifications are not set up on the server yet.')
      const reg = await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }))
      await call('/admin/push/subscribe', { subscription: sub.toJSON() })
      setEnabled(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setBusy(true)
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
      if (sub) {
        await call('/admin/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
        await sub.unsubscribe()
      }
      setEnabled(false)
    } finally {
      setBusy(false)
    }
  }, [])

  const test = useCallback(() => call('/admin/push/test', {}), [])

  return { supported: pushSupported(), enabled, busy, error, enable, disable, test }
}
