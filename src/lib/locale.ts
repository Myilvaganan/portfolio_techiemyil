import { useSyncExternalStore } from 'react'

// Region, display currency and language for the whole app. Every amount is stored in rupees; the display currency only
// changes how rupee amounts are shown (converted at a daily rate). Kept in one tiny store, like the privacy toggle, so a
// change re-renders everything at once and plain functions (formatInr, reports) can read it too.

export type Language = 'en' | 'ta'
export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD'
export type RegionId = 'IN' | 'US' | 'GB' | 'EU' | 'AE' | 'SG'

export interface Region {
  id: RegionId
  label: string
  /** Number and date formatting (lakh grouping for India, millions elsewhere). */
  numberLocale: string
  timeZone: string
  currency: Currency
}

export const REGIONS: Region[] = [
  { id: 'IN', label: 'India', numberLocale: 'en-IN', timeZone: 'Asia/Kolkata', currency: 'INR' },
  { id: 'US', label: 'United States', numberLocale: 'en-US', timeZone: 'America/New_York', currency: 'USD' },
  { id: 'GB', label: 'United Kingdom', numberLocale: 'en-GB', timeZone: 'Europe/London', currency: 'GBP' },
  { id: 'EU', label: 'Europe', numberLocale: 'en-IE', timeZone: 'Europe/Berlin', currency: 'EUR' },
  { id: 'AE', label: 'UAE', numberLocale: 'en-AE', timeZone: 'Asia/Dubai', currency: 'AED' },
  { id: 'SG', label: 'Singapore', numberLocale: 'en-SG', timeZone: 'Asia/Singapore', currency: 'SGD' },
]

export const CURRENCIES: { id: Currency; symbol: string; label: string }[] = [
  { id: 'INR', symbol: '₹', label: 'Indian rupee' },
  { id: 'USD', symbol: '$', label: 'US dollar' },
  { id: 'EUR', symbol: '€', label: 'Euro' },
  { id: 'GBP', symbol: '£', label: 'British pound' },
  { id: 'AED', symbol: 'AED ', label: 'UAE dirham' },
  { id: 'SGD', symbol: 'S$', label: 'Singapore dollar' },
]

export interface LocaleSettings {
  language: Language
  region: RegionId
  currency: Currency
}

const KEY = 'app_locale_v1'
const RATES_KEY = 'app_fx_inr_v1'
const DEFAULTS: LocaleSettings = { language: 'en', region: 'IN', currency: 'INR' }

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable: the choice just won't survive a reload.
  }
}

let settings: LocaleSettings = { ...DEFAULTS, ...(read<Partial<LocaleSettings>>(KEY) ?? {}) }
/** How many units of each currency one rupee buys, and when it was fetched. */
let rates: { at: number; perInr: Partial<Record<Currency, number>> } | null = read(RATES_KEY)

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export const getLocale = () => settings
export const regionOf = (id: RegionId = settings.region) => REGIONS.find((r) => r.id === id) ?? REGIONS[0]
export const symbolOf = (c: Currency) => CURRENCIES.find((x) => x.id === c)?.symbol ?? `${c} `

export function setLocale(next: Partial<LocaleSettings>) {
  settings = { ...settings, ...next }
  write(KEY, settings)
  document.documentElement.lang = settings.language === 'ta' ? 'ta' : 'en'
  emit()
  if (settings.currency !== 'INR') void refreshRates()
}

/** Rupee → display-currency rate, or null when it is INR or no rate is known yet (then amounts stay in rupees). */
export function displayRate(): number | null {
  if (settings.currency === 'INR') return null
  const r = rates?.perInr[settings.currency]
  return typeof r === 'number' && r > 0 ? r : null
}

/** The currency amounts are really shown in: the chosen one, or rupees until its rate has loaded. */
export const displayCurrency = (): Currency => (displayRate() ? settings.currency : 'INR')

const DAY = 24 * 60 * 60 * 1000

/** Store fresh rates (also used by tests to avoid the network). */
export function setRates(perInr: Partial<Record<Currency, number>>) {
  rates = { at: Date.now(), perInr }
  write(RATES_KEY, rates)
  emit()
}

export async function refreshRates(force = false) {
  if (!force && rates && Date.now() - rates.at < DAY) return
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/INR', { signal: AbortSignal.timeout(6000) })
    const data = await res.json()
    const perInr: Partial<Record<Currency, number>> = {}
    for (const c of CURRENCIES) if (typeof data?.rates?.[c.id] === 'number') perInr[c.id] = data.rates[c.id]
    if (Object.keys(perInr).length > 1) setRates(perInr)
  } catch {
    // Offline or blocked: keep the last known rates (or rupees).
  }
}

let version = 0
subscribe(() => version++)

/** Re-renders the caller when the language, region, currency or rates change. */
export function useLocale(): LocaleSettings & { version: number } {
  const v = useSyncExternalStore(subscribe, () => version)
  return { ...settings, version: v }
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = settings.language === 'ta' ? 'ta' : 'en'
  if (settings.currency !== 'INR') void refreshRates()
}
