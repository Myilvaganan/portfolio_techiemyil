import { useEffect, useRef } from 'react'
import { setHidden } from '@/lib/privacy'

export const HIDE_AFTER_MS = 5 * 60_000
export const LOCK_AFTER_MS = 30 * 60_000
const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const

/**
 * Private mode on a timer: after a few idle minutes every number switches to stars, and after a longer idle stretch the
 * admin signs out. Time spent in a hidden tab counts as idle, so a laptop left open is covered too.
 */
export function useIdleLock(onLock: () => void, { hideAfter = HIDE_AFTER_MS, lockAfter = LOCK_AFTER_MS } = {}) {
  const lockRef = useRef(onLock)
  lockRef.current = onLock

  useEffect(() => {
    let last = Date.now()
    let hid = false
    const seen = () => {
      last = Date.now()
      hid = false
    }
    const check = () => {
      const idle = Date.now() - last
      if (idle >= lockAfter) {
        window.clearInterval(timer)
        lockRef.current()
      } else if (idle >= hideAfter && !hid) {
        hid = true
        setHidden(true)
      }
    }
    const timer = window.setInterval(check, 15_000)
    const onVisible = () => document.visibilityState === 'visible' && check()
    for (const e of EVENTS) window.addEventListener(e, seen, { passive: true })
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      for (const e of EVENTS) window.removeEventListener(e, seen)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [hideAfter, lockAfter])
}
