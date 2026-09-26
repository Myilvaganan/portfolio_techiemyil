import { useCallback, useEffect, useState } from 'react'
import { appLockEnabled, appLockSupported, disableAppLock, enableAppLock, unlockWithBiometrics } from '@/lib/appLock'

const RELOCK_AFTER_MS = 60_000

/** Locks the admin behind the device's biometrics on open, and again after a minute in the background. */
export function useAppLock() {
  const [enabled, setEnabled] = useState(appLockEnabled)
  const [locked, setLocked] = useState(appLockEnabled)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    let alive = true
    void appLockSupported().then((ok) => alive && setSupported(ok))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER_MS) setLocked(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [enabled])

  const unlock = useCallback(async () => {
    if (await unlockWithBiometrics()) setLocked(false)
  }, [])

  const enable = useCallback(async () => {
    if (await enableAppLock()) {
      setEnabled(true)
      return true
    }
    return false
  }, [])

  const disable = useCallback(() => {
    disableAppLock()
    setEnabled(false)
    setLocked(false)
  }, [])

  return { enabled, locked, supported, unlock, enable, disable }
}
