import {
  DEFAULT_LEVERAGE,
  INSTRUMENTS,
  LEVERAGE_OPTIONS,
  type Direction,
  type InstrumentId,
} from './margin'

const STORAGE_KEY = 'margin-calculator-inputs'
const MAX_TEXT_LENGTH = 20

export interface MarginInputs {
  instrument: InstrumentId
  direction: Direction
  lots: number
  leverage: number
  /** null = follow the instrument's price; a string = the user typed their own. */
  priceOverride: string | null
  pnlEntryOverride: string | null
  exit: string
  stopLoss: string
  balance: string
  slPoints: string
}

export const DEFAULT_INPUTS: MarginInputs = {
  instrument: 'XAUUSD',
  direction: 'BUY',
  lots: 0.1,
  leverage: DEFAULT_LEVERAGE,
  priceOverride: null,
  pnlEntryOverride: null,
  exit: '',
  stopLoss: '',
  balance: '1000',
  slPoints: '20',
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT_LENGTH) : fallback
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT_LENGTH) : null
}

// Every field is checked on its own, so one stale or hand-edited value falls
// back to its default without discarding the rest of what was saved.
function sanitize(raw: unknown): MarginInputs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_INPUTS
  return {
    instrument: typeof r.instrument === 'string' && r.instrument in INSTRUMENTS ? (r.instrument as InstrumentId) : d.instrument,
    direction: r.direction === 'BUY' || r.direction === 'SELL' ? r.direction : d.direction,
    lots: typeof r.lots === 'number' && Number.isFinite(r.lots) && r.lots > 0 ? r.lots : d.lots,
    leverage:
      typeof r.leverage === 'number' && (LEVERAGE_OPTIONS as readonly number[]).includes(r.leverage) ? r.leverage : d.leverage,
    priceOverride: optionalText(r.priceOverride),
    pnlEntryOverride: optionalText(r.pnlEntryOverride),
    exit: text(r.exit, d.exit),
    stopLoss: text(r.stopLoss, d.stopLoss),
    balance: text(r.balance, d.balance),
    slPoints: text(r.slPoints, d.slPoints),
  }
}

export function loadMarginInputs(): MarginInputs {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? sanitize(JSON.parse(stored)) : { ...DEFAULT_INPUTS }
  } catch {
    // Unavailable storage or corrupt JSON — start from the defaults.
    return { ...DEFAULT_INPUTS }
  }
}

export function saveMarginInputs(inputs: MarginInputs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs))
  } catch {
    // localStorage unavailable (e.g. private mode) — inputs just won't persist.
  }
}
