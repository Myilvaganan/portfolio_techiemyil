// Backfills the trading journal from the trades already imported into Options Analytics: every closed round trip
// (flat-to-flat on one contract) becomes one journal trade. Nothing here talks to the network except loadBackfillPlan.

import { SAMPLE_BROKER, brokerLabel } from './brokers'
import { blankTrade, type Trade } from './journal'
import {
  DEFAULT_CHARGE_RATES,
  buildRoundTrips,
  estimateCharges,
  type ChargeRates,
  type Fill,
  type RoundTrip,
} from './optionsAnalytics'
import { fetchStoredBrokers, fetchStoredFills } from './optionsStore'

// The key OptionsAnalytics saves each broker's charge rates under, so fees here match what that page shows.
const RATES_KEY = 'options_rates_v1'

export function loadChargeRates(): Record<string, ChargeRates> {
  try {
    return JSON.parse(localStorage.getItem(RATES_KEY) ?? '{}')
  } catch {
    return {}
  }
}

const round = (n: number, dp: number) => {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

// FNV-1a with two seeds → a 16-hex-char digest. Deterministic, so importing twice produces the same ids.
function digest(input: string): string {
  const one = (seed: number) => {
    let h = seed
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return (h >>> 0).toString(16).padStart(8, '0')
  }
  return one(2166136261) + one(0x9e3779b1)
}

/** Same trip on the same broker always gets the same id; a different broker or contract never collides. */
export function backfillId(broker: string, trip: Pick<RoundTrip, 'symbol' | 'openTs' | 'closeTs' | 'direction' | 'qty'>): string {
  return `oa-${broker}-${digest(`${trip.symbol}|${trip.openTs}|${trip.closeTs}|${trip.direction}|${trip.qty}`)}`
}

const fillKey = (f: Fill) => `${f.id}|${f.symbol}|${f.ts}`

/** One journal trade per closed round trip. Contracts still open (not yet expired) have no realised P&L and are left out. */
export function tradesFromFills(broker: string, fills: Fill[], rates: ChargeRates = DEFAULT_CHARGE_RATES, asOf: string): Trade[] {
  const { trips } = buildRoundTrips(fills, asOf)
  const label = brokerLabel(broker)
  const claimed = new Set<string>()

  return trips.map((trip) => {
    // The trade's own fills: same contract, inside its open→close window, each claimed by at most one trade.
    const legs = fills.filter((f) => !f.synthetic && f.symbol === trip.symbol && f.ts >= trip.openTs && f.ts <= trip.closeTs && !claimed.has(fillKey(f)))
    legs.forEach((f) => claimed.add(fillKey(f)))
    // Real charges from the statement win over estimates; that is what estimateCharges already does per order.
    const fees = estimateCharges(legs, rates).reduce((sum, c) => sum + c.total, 0)

    const overnight = trip.openDate !== trip.closeDate
    const notes = [
      `Imported from Options Analytics (${label}).`,
      overnight ? `Opened ${trip.openDate} ${trip.openTime.slice(0, 5)}, closed ${trip.closeDate}.` : '',
      trip.expired ? 'Held to expiry.' : '',
    ]
      .filter(Boolean)
      .join(' ')

    return {
      ...blankTrade(trip.closeDate),
      id: backfillId(broker, trip),
      // A trade belongs to the day its profit or loss was realised.
      date: trip.closeDate,
      time: overnight ? '' : trip.openTime.slice(0, 5),
      instrument: 'Options',
      symbol: `${trip.underlying} ${trip.strike} ${trip.type} · ${trip.expiry}`,
      direction: trip.direction === 'LONG' ? 'BUY' : 'SELL',
      qty: trip.qty,
      entry: round(trip.entryPrice, 4),
      exit: round(trip.exitPrice, 4),
      // The P&L comes straight from the matched fills; recomputing from the averaged prices could drift by paise.
      manualPnl: true,
      grossPnl: round(trip.pnl, 2),
      fees: round(fees, 2),
      notes,
      source: `options-analytics:${broker}`,
    }
  })
}

export interface BackfillBroker {
  id: string
  label: string
  trades: Trade[]
  /** First and last close dates, or '' when there are no closed trades. */
  from: string
  to: string
  /** Net P&L before fees, and the fees that will be recorded, in INR. */
  gross: number
  fees: number
}

export function summarise(broker: string, trades: Trade[]): BackfillBroker {
  const dates = trades.map((t) => t.date).sort()
  return {
    id: broker,
    label: brokerLabel(broker),
    trades,
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
    gross: trades.reduce((s, t) => s + t.grossPnl, 0),
    fees: trades.reduce((s, t) => s + t.fees, 0),
  }
}

/** Reads every broker's stored fills from the vault and prepares the trades that would be imported. */
export async function loadBackfillPlan(asOf: string): Promise<BackfillBroker[]> {
  const ids = (await fetchStoredBrokers()).filter((id) => id !== SAMPLE_BROKER)
  const rates = loadChargeRates()
  const plan = await Promise.all(
    ids.map(async (id) => summarise(id, tradesFromFills(id, await fetchStoredFills(id), rates[id] ?? DEFAULT_CHARGE_RATES, asOf))),
  )
  return plan.filter((b) => b.trades.length > 0)
}

export interface BackfillRow {
  broker: BackfillBroker
  /** Closed trades not in the journal yet. */
  fresh: Trade[]
  /** How many of the broker's closed trades are already in the journal. */
  already: number
}

export interface BackfillDiff {
  rows: BackfillRow[]
  /**
   * Journal trades imported earlier whose id Options Analytics no longer produces — its history changed after they
   * were imported (e.g. a later statement added a missing fill), so a fresh import would add a second copy.
   */
  outdated: Trade[]
}

const IMPORT_PREFIX = 'options-analytics:'

/** What an import would add, and which earlier imports have gone stale. One source of truth for the badge and the dialog. */
export function diffBackfill(plan: BackfillBroker[], journal: Trade[]): BackfillDiff {
  const have = new Set(journal.map((t) => t.id))
  const rows = plan.map((broker) => {
    const fresh = broker.trades.filter((t) => !have.has(t.id))
    return { broker, fresh, already: broker.trades.length - fresh.length }
  })

  const current = new Set(plan.flatMap((b) => b.trades.map((t) => t.id)))
  const brokers = new Set(plan.map((b) => b.id))
  const outdated = journal.filter((t) => {
    const source = t.source ?? ''
    // Only trades from a broker we just re-read can be judged; hand-typed trades are never touched.
    return source.startsWith(IMPORT_PREFIX) && brokers.has(source.slice(IMPORT_PREFIX.length)) && !current.has(t.id)
  })
  return { rows, outdated }
}

