import { useEffect, useState } from 'react'
import { ALL_ACCOUNTS, monthOf, netInr } from '@/lib/journal'
import { fetchJournal } from '@/lib/journalStore'
import { fetchUsdInr } from '@/lib/livePrices'
import { FALLBACK_USD_INR } from '@/lib/margin'

export interface TodayAll {
  /** Net P&L today across the options journal and every MT5 account, in rupees. */
  net: number
  trades: number
  /** False until the first load finishes, so the tile can show a dash instead of a misleading zero. */
  ready: boolean
}

/**
 * Today's result across ALL journals, whichever one is open. Dollar (MT5) trades are converted at the live rate, the same as
 * the combined view. `reloadKey` changes whenever the open journal reloads, so a trade just added shows up here too.
 */
export function useTodayAll(today: string, reloadKey: unknown): TodayAll {
  const [state, setState] = useState<TodayAll>({ net: 0, trades: 0, ready: false })

  useEffect(() => {
    let cancelled = false
    const month = monthOf(today)
    Promise.all([fetchJournal(month, month, ALL_ACCOUNTS), fetchUsdInr().catch(() => null)])
      .then(([data, rate]) => {
        if (cancelled) return
        const usdInr = rate || FALLBACK_USD_INR
        const todays = data.trades.filter((t) => t.date === today).map((t) => (t.account ? { ...t, fxRate: usdInr } : t))
        setState({ net: todays.reduce((sum, t) => sum + netInr(t), 0), trades: todays.length, ready: true })
      })
      .catch(() => {
        // The month itself reports connection problems; the tile just stays on its dash.
      })
    return () => {
      cancelled = true
    }
  }, [today, reloadKey])

  return state
}
