import { createContext, useContext, useMemo, useSyncExternalStore } from 'react'
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
  /** The currency amounts are shown in: 'INR' for the options journal, the account currency for a Forex account. */
  currency: string
  /** ₹ / $ / € … */
  symbol: string
  /** ₹1,234 — unsigned, in this book's currency (the name is historical; it is not always rupees). */
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

const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥', AUD: 'A$', CAD: 'C$', NZD: 'NZ$', SGD: 'S$', HKD: 'HK$', CHF: 'CHF ' }

export const symbolFor = (currency: string) => SYMBOLS[currency] ?? `${currency} `

// Rupee amounts are whole numbers in lakhs/crores; dollar-sized amounts are small and need their cents.
const compactInr = (n: number) => {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= 1e7) return `${sign}${(a / 1e7).toFixed(1)}Cr`
  if (a >= 1e5) return `${sign}${(a / 1e5).toFixed(1)}L`
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`
  return `${sign}${Math.round(a)}`
}

const compactForeign = (n: number) => {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a === 0) return '0'
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}M`
  if (a >= 1e4) return `${sign}${Math.round(a / 1e3)}k`
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)}k`
  if (a >= 100) return `${sign}${Math.round(a)}`
  if (a >= 10) return `${sign}${a.toFixed(1)}`
  return `${sign}${a.toFixed(2)}`
}

export function makeMoney(isHidden: boolean, currency = 'INR'): Money {
  if (currency === 'INR') {
    return {
      hidden: isHidden,
      currency,
      symbol: '₹',
      inr: (n, d = 0) => (isHidden ? `₹${MASK}` : formatInr(n, d)),
      signed: (n, d = 0) => (isHidden ? `${n < 0 ? '-' : n > 0 ? '+' : ''}₹${MASK}` : formatSignedInr(n, d)),
      pct: (n, d = 1) => (isHidden ? `${MASK}%` : `${n.toFixed(d)}%`),
      axis: (n) => (isHidden ? '*' : compactInr(n)),
      compact: (n) => (isHidden ? MASK : `${n > 0 ? '+' : ''}${compactInr(n)}`),
    }
  }

  const symbol = symbolFor(currency)
  const plain = (n: number, d: number) => `${symbol}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
  return {
    hidden: isHidden,
    currency,
    symbol,
    inr: (n, d = 2) => (isHidden ? `${symbol}${MASK}` : plain(n, d)),
    signed: (n, d = 2) => (isHidden ? `${n < 0 ? '-' : n > 0 ? '+' : ''}${symbol}${MASK}` : `${n < 0 ? '-' : n > 0 ? '+' : ''}${plain(n, d)}`),
    pct: (n, d = 1) => (isHidden ? `${MASK}%` : `${n.toFixed(d)}%`),
    axis: (n) => (isHidden ? '*' : compactForeign(n)),
    compact: (n) => (isHidden ? MASK : `${n > 0 ? '+' : ''}${compactForeign(n)}`),
  }
}

// One journal at a time is on screen, so the currency is set once around it instead of threaded through every component.
const CurrencyContext = createContext('INR')
export const CurrencyProvider = CurrencyContext.Provider
export const useCurrency = () => useContext(CurrencyContext)

export function useMoney(): Money {
  const { hidden: isHidden } = usePrivacy()
  const currency = useContext(CurrencyContext)
  return useMemo(() => makeMoney(isHidden, currency), [isHidden, currency])
}
