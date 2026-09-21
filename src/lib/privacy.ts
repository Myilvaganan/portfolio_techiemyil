import { useMemo, useSyncExternalStore } from 'react'
import { formatInr, formatSignedInr } from './kite'

// "Hidden mode": every amount is drawn as stars so the journal can be opened in public. The choice is remembered
// in this browser and shared by every component through one tiny store, so a toggle updates them all at once.

const STORAGE_KEY = 'journal_hide_numbers'
export const MASK = '****'

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

let hidden = readStored()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setHidden(next: boolean) {
  if (next === hidden) return
  hidden = next
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  } catch {
    // Storage unavailable — the choice just won't survive a reload.
  }
  listeners.forEach((l) => l())
}

export function usePrivacy() {
  const isHidden = useSyncExternalStore(subscribe, () => hidden)
  return { hidden: isHidden, toggle: () => setHidden(!hidden), setHidden }
}

export interface Money {
  hidden: boolean
  /** ₹1,234 — unsigned. */
  inr: (n: number, decimals?: number) => string
  /** +₹1,234 / -₹1,234. */
  signed: (n: number, decimals?: number) => string
  /** Percentages that reveal size (returns, drawdown). */
  pct: (n: number, decimals?: number) => string
  /** Chart axis labels: just a mask when hidden. */
  axis: (n: number) => string
  /** +1.2k / -3L — for small spaces like calendar cells. */
  compact: (n: number) => string
}

const compactAxis = (n: number) => {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= 1e7) return `${sign}${(a / 1e7).toFixed(1)}Cr`
  if (a >= 1e5) return `${sign}${(a / 1e5).toFixed(1)}L`
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`
  return `${sign}${Math.round(a)}`
}

export function makeMoney(isHidden: boolean): Money {
  return {
    hidden: isHidden,
    inr: (n, d = 0) => (isHidden ? `₹${MASK}` : formatInr(n, d)),
    signed: (n, d = 0) => (isHidden ? `${n < 0 ? '-' : n > 0 ? '+' : ''}₹${MASK}` : formatSignedInr(n, d)),
    pct: (n, d = 1) => (isHidden ? `${MASK}%` : `${n.toFixed(d)}%`),
    axis: (n) => (isHidden ? '*' : compactAxis(n)),
    compact: (n) => (isHidden ? MASK : `${n > 0 ? '+' : ''}${compactAxis(n)}`),
  }
}

export function useMoney(): Money {
  const { hidden: isHidden } = usePrivacy()
  return useMemo(() => makeMoney(isHidden), [isHidden])
}
