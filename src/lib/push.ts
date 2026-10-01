import { useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
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

/** Inside the Android app, notifications come through Firebase Cloud Messaging instead of web push. */
const isNative = () => Capacitor.isNativePlatform()
const FCM_TOKEN_KEY = 'admin-fcm-token'
const storedFcmToken = () => {
  try {
    return localStorage.getItem(FCM_TOKEN_KEY)
  } catch {
    return null
  }
}

/** Ask Android for permission and a Firebase device token. */
async function nativeToken(): Promise<string> {
  let perm = await PushNotifications.checkPermissions()
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions()
  if (perm.receive !== 'granted') throw new Error('Notifications are blocked for this app in Android settings.')
  return new Promise((resolve, reject) => {
    const handles = [
      PushNotifications.addListener('registration', ({ value }) => {
        handles.forEach((h) => h.then((x) => x.remove()))
        resolve(value)
      }),
      PushNotifications.addListener('registrationError', ({ error }) => {
        handles.forEach((h) => h.then((x) => x.remove()))
        reject(new Error(error || 'Could not register for notifications.'))
      }),
    ]
    PushNotifications.register().catch(reject)
  })
}

/** In the Android app, tapping a notification opens the page it is about. */
export function useNativePushTaps(navigate: (to: string) => void) {
  useEffect(() => {
    if (!isNative()) return
    const handle = PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const url = notification.data?.url
      if (typeof url === 'string' && url.startsWith('/')) navigate(url)
    })
    return () => {
      handle.then((h) => h.remove())
    }
  }, [navigate])
}

export const pushSupported = () => isNative() || typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** Notifications on this device: state, and turning them on/off (asks for permission the first time). */
export function usePush() {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNative()) {
      PushNotifications.checkPermissions().then((p) => setEnabled(p.receive === 'granted' && Boolean(storedFcmToken()))).catch(() => {})
      return
    }
    if (!pushSupported()) return
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setEnabled(Boolean(s) && Notification.permission === 'granted')).catch(() => {})
  }, [])

  const enable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      if (isNative()) {
        const token = await nativeToken()
        await call('/admin/push/fcm/register', { token })
        try {
          localStorage.setItem(FCM_TOKEN_KEY, token)
        } catch {
          // Only used to show the switch as on; the device stays registered on the server either way.
        }
        setEnabled(true)
        return
      }
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
      if (isNative()) {
        const token = storedFcmToken()
        if (token) await call('/admin/push/fcm/unregister', { token }).catch(() => {})
        await PushNotifications.unregister().catch(() => {})
        try {
          localStorage.removeItem(FCM_TOKEN_KEY)
        } catch {
          // Nothing to clear.
        }
        setEnabled(false)
        return
      }
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
