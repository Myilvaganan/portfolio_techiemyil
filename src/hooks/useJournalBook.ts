import { useLocation } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ALL_ACCOUNTS,
  DEFAULT_SETTINGS,
  byWhen,
  groupByDate,
  monthOf,
  todayStr,
  type DayNote,
  type JournalSettings,
  type Trade,
} from '@/lib/journal'
import { deleteTrade, fetchJournal, fetchSettings, saveDayNote, saveSettings, saveTrade } from '@/lib/journalStore'
import { fetchUsdInr } from '@/lib/livePrices'
import { FALLBACK_USD_INR } from '@/lib/margin'

/**
 * Everything one journal needs to show a month: the trades and day notes, which day is selected, and saving. The
 * options journal and each Forex account use this with a different `account`, so they behave identically and stay
 * separate ('' is the main journal; an MT5 account number is that account's own calendar).
 */
export function useJournalBook(account: string) {
  const { search } = useLocation()
  const today = useMemo(() => todayStr(), [])
  const [month, setMonth] = useState(monthOf(today))
  const [selected, setSelected] = useState(today)
  const [trades, setTrades] = useState<Trade[]>([])
  const [days, setDays] = useState<Record<string, DayNote>>({})
  const [settings, setSettings] = useState<JournalSettings>(DEFAULT_SETTINGS)
  const [usdInr, setUsdInr] = useState(FALLBACK_USD_INR)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  /** Bumped whenever trades change, so the dashboard reloads. */
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchSettings()
      .then((s) => !cancelled && setSettings(s))
      .catch(() => {
        // The month load below surfaces connection problems; defaults keep the page usable meanwhile.
      })
    fetchUsdInr().then((rate) => !cancelled && rate && setUsdInr(rate))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchJournal(month, month, account)
      .then((data) => {
        if (cancelled) return
        setTrades(data.trades)
        setDays(data.days)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the journal.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [month, attempt, account])

  // In the combined view every trade is shown in rupees, so dollar (MT5) trades are converted at today's rate.
  const shown = useMemo(() => (account === ALL_ACCOUNTS ? trades.map((t) => (t.account ? { ...t, fxRate: usdInr } : t)) : trades), [trades, account, usdInr])
  const byDate = useMemo(() => groupByDate(shown), [shown])

  const goToMonth = useCallback(
    (next: string) => {
      setMonth(next)
      setSelected(next === monthOf(today) ? today : `${next}-01`)
    },
    [today],
  )

  useEffect(() => {
    const date = new URLSearchParams(search).get('date')
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    const parsed = new Date(`${date}T00:00:00Z`)
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return
    setMonth(monthOf(date))
    setSelected(date)
  }, [search])

  /** Move the selected day by whole days, following the calendar into the neighbouring month when needed. */
  const stepDay = useCallback(
    (delta: number) => {
      const d = new Date(`${selected}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + delta)
      const next = d.toISOString().slice(0, 10)
      setMonth(monthOf(next))
      setSelected(next)
    },
    [selected],
  )

  /** Reload the month from the server and refresh anything derived from it. */
  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1)
    setAttempt((n) => n + 1)
  }, [])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const handleSaveTrade = useCallback(
    async (trade: Trade, previousDate?: string) => {
      const saved = await saveTrade(trade, previousDate)
      setRefreshKey((k) => k + 1)
      if (monthOf(saved.date) !== month) {
        // Saved into another month: jump there so the trade is visible.
        setMonth(monthOf(saved.date))
        setSelected(saved.date)
        return
      }
      setTrades((prev) => [...prev.filter((t) => t.id !== saved.id), saved].sort(byWhen))
      setSelected(saved.date)
    },
    [month],
  )

  const handleDeleteTrade = useCallback(async (trade: Trade) => {
    await deleteTrade(trade)
    setTrades((prev) => prev.filter((t) => t.id !== trade.id))
    setRefreshKey((k) => k + 1)
  }, [])

  const handleSaveNote = useCallback(
    async (note: DayNote) => {
      const saved = await saveDayNote({ ...note, account })
      setDays((prev) => {
        const next = { ...prev }
        if (saved) next[saved.date] = saved
        else delete next[note.date]
        return next
      })
    },
    [account],
  )

  const handleSaveSettings = useCallback(async (next: JournalSettings) => {
    setSettings(await saveSettings(next))
  }, [])

  return {
    today,
    month,
    selected,
    setSelected,
    goToMonth,
    stepDay,
    trades: shown,
    days,
    byDate,
    settings,
    usdInr,
    loading,
    error,
    refreshKey,
    reload,
    retry,
    handleSaveTrade,
    handleDeleteTrade,
    handleSaveNote,
    handleSaveSettings,
  }
}
