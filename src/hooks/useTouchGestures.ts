import { useEffect, useState } from 'react'

const PULL_TRIGGER = 80
const EDGE = 24

/**
 * Native-app touch gestures for phones: pull down from the top to refresh, swipe in from the left edge to go back.
 * `pull` is 0..1 while dragging, so the page can show progress.
 */
export function useTouchGestures({ onRefresh, onBack }: { onRefresh: () => void; onBack: () => void }) {
  const [pull, setPull] = useState(0)

  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return
    let startX = 0
    let startY = 0
    let mode: 'none' | 'pull' | 'back' = 'none'
    let dx = 0
    let dy = 0

    const start = (e: TouchEvent) => {
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      dx = dy = 0
      mode = startX < EDGE ? 'back' : window.scrollY <= 0 ? 'pull' : 'none'
    }
    const move = (e: TouchEvent) => {
      if (mode === 'none') return
      const t = e.touches[0]
      dx = t.clientX - startX
      dy = t.clientY - startY
      if (mode === 'pull') {
        // Only a mostly-vertical downward drag counts, and not while a modal or sheet owns the scroll.
        if (dy > 0 && dy > Math.abs(dx)) setPull(Math.min(dy / PULL_TRIGGER, 1))
        else setPull(0)
      }
    }
    const end = () => {
      if (mode === 'pull' && dy > PULL_TRIGGER && dy > Math.abs(dx)) onRefresh()
      if (mode === 'back' && dx > 90 && Math.abs(dy) < 60) onBack()
      mode = 'none'
      setPull(0)
    }

    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', end, { passive: true })
    document.addEventListener('touchcancel', end, { passive: true })
    return () => {
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', end)
    }
  }, [onRefresh, onBack])

  return pull
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
