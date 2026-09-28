import { useEffect, useState } from 'react'
import { ALL_ACCOUNTS, netInr } from '@/lib/journal'
import { fetchJournal } from '@/lib/journalStore'
import { fetchUsdInr } from '@/lib/livePrices'
import { FALLBACK_USD_INR } from '@/lib/margin'

export interface MonthTotals {
  /** Options journal, net of fees, in rupees. */
  optionsInr: number
  /** Every MT5 account, net of fees, in dollars. */
  forexUsd: number
  /** Everything together in rupees (dollar trades converted at `usdInr`). */
  allInr: number
  usdInr: number
  /** False until the first load finishes, so the tiles show a dash instead of a misleading zero. */
  ready: boolean
}

const EMPTY: MonthTotals = { optionsInr: 0, forexUsd: 0, allInr: 0, usdInr: FALLBACK_USD_INR, ready: false }

/**
 * The month's result for each journal on its own currency plus one combined figure, whichever journal is open:
 * Options in rupees, Forex in dollars, and All in rupees. `reloadKey` changes when the open month reloads.
 */
export function useMonthTotals(month: string, reloadKey: unknown): MonthTotals {
  const [state, setState] = useState<MonthTotals>(EMPTY)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchJournal(month, month, ALL_ACCOUNTS), fetchUsdInr().catch(() => null)])
      .then(([data, rate]) => {
        if (cancelled) return
        const usdInr = rate || FALLBACK_USD_INR
        const inRupees = data.trades.map((t) => (t.account ? { ...t, fxRate: usdInr } : t))
        const sum = (xs: typeof inRupees) => xs.reduce((s, t) => s + netInr(t), 0)
        const optionsInr = sum(inRupees.filter((t) => !t.account))
        const forexInr = sum(inRupees.filter((t) => t.account))
        setState({ optionsInr, forexUsd: forexInr / usdInr, allInr: optionsInr + forexInr, usdInr, ready: true })
      })
      .catch(() => {
        // The month itself reports connection problems; the totals just stay on their dashes.
      })
    return () => {
      cancelled = true
    }
  }, [month, reloadKey])

  return state
}
