import { useCallback, useSyncExternalStore } from 'react'
import type { Notice } from './pulse'

// Alerts the person closed with ✕. Keyed by what the alert says, not just its id, so the same kind of alert comes back
// when something new happens (next month's EMI, a different card bill) while the one they closed stays hidden.
const KEY = 'admin_dismissed_notices'
const MAX = 200
const listeners = new Set<() => void>()

// The same alert with only its countdown changed ("in 4 days" → "in 3 days") is still the same alert: numbers are
// ignored, and a dismissal lasts for the rest of the month, so next month's EMI or bill shows up again.
const month = () => new Date().toISOString().slice(0, 7)
const signature = (n: Notice) => `${n.id}|${n.title.replace(/[\d,.₹$]+/g, '#')}|${month()}`

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
let cache = read()

function write(list: string[]) {
  cache = list.slice(-MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // Kept for this session only.
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Filters out closed alerts; `dismiss` hides one everywhere (home, bell, top-bar pill) at once. */
export function useDismissedNotices() {
  const list = useSyncExternalStore(subscribe, () => cache)
  const visible = useCallback((notices: Notice[]) => notices.filter((n) => !list.includes(signature(n))), [list])
  const dismiss = useCallback((n: Notice) => write([...cache.filter((s) => s !== signature(n)), signature(n)]), [])
  const restoreAll = useCallback(() => write([]), [])
  const dismissAll = useCallback((ns: Notice[]) => write([...cache, ...ns.map(signature).filter((s) => !cache.includes(s))]), [])
  return { visible, dismiss, dismissAll, restoreAll, count: list.length }
}
