import { useEffect, useState } from 'react'
import { ALL_ACCOUNTS, DEFAULT_SETTINGS, type JournalSettings, type Trade } from '../journal'
import { fetchJournal, fetchSettings } from '../journalStore'
import { fetchLoanDocs, fetchStatements } from '../statementsApi'
import { buildLoans, type Loan } from '../loans'
import { fetchFinance } from '../financeApi'
import { fetchGoals, fetchSnapshots } from '../wealthApi'
import { fetchLending } from '../lendingApi'
import { fetchLogs } from '../healthApi'
import { fetchUsdInr } from '../livePrices'
import { FALLBACK_USD_INR } from '../margin'
import type { Txn } from '../statements'
import type { Goal } from '../goals'
import type { DailyLog } from '../health'
import type { LendingEntry } from '../lending'
import type { WealthSnapshot } from '../netWorthHistory'
import type { TagMap } from '../budget'

// Everything the growth modules read already lives in the vault. Each page asks only for what it needs; results are
// cached for the session so moving between modules doesn't refetch.

export interface Sources {
  trades: Trade[]
  settings: JournalSettings
  usdInr: number
  bank: Txn[]
  card: Txn[]
  tags: TagMap
  budgets: Record<string, number>
  goals: Goal[]
  loans: Loan[]
  lending: LendingEntry[]
  health: DailyLog[]
  snapshots: WealthSnapshot[]
}
export type SourceKey = keyof Sources

const LOADERS: { [K in SourceKey]: () => Promise<Sources[K]> } = {
  trades: async () => {
    const [data, rate] = await Promise.all([fetchJournal(undefined, undefined, ALL_ACCOUNTS), fetchUsdInr().catch(() => null)])
    const usd = rate || FALLBACK_USD_INR
    // Dollar trades are converted at today's rate, as in the combined journal view.
    return data.trades.map((t) => (t.currency === 'USD' ? { ...t, fxRate: usd } : t))
  },
  settings: () => fetchSettings().catch(() => DEFAULT_SETTINGS),
  usdInr: async () => (await fetchUsdInr().catch(() => null)) || FALLBACK_USD_INR,
  bank: async () => (await fetchStatements('bank')).transactions,
  card: async () => (await fetchStatements('card')).transactions,
  tags: async () => (await fetchFinance()).tags as TagMap,
  budgets: async () => (await fetchFinance()).budgets,
  goals: () => fetchGoals(),
  loans: async () => buildLoans((await fetchLoanDocs()).statements),
  lending: () => fetchLending(),
  health: () => fetchLogs(),
  snapshots: () => fetchSnapshots(),
}

const cache = new Map<SourceKey, Promise<unknown>>()

export function loadSource<K extends SourceKey>(key: K): Promise<Sources[K]> {
  if (!cache.has(key)) {
    const p = LOADERS[key]()
    cache.set(key, p)
    p.catch(() => cache.delete(key))
  }
  return cache.get(key) as Promise<Sources[K]>
}

/** Forget cached data so the next page load reads fresh values (after an import, for example). */
export const clearSources = () => cache.clear()

/**
 * `const { data, loading, errors } = useSources(['trades', 'bank'], version)` — bump `version` (after clearSources) to reload. A source that fails is left empty and reported
 * in `errors`, so one unavailable source never blanks the whole page.
 */
export function useSources<K extends SourceKey>(keys: K[], version = 0) {
  const [data, setData] = useState<Partial<Pick<Sources, K>>>({})
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const sig = keys.join(',')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.allSettled(keys.map((k) => loadSource(k))).then((results) => {
      if (cancelled) return
      const next: Partial<Sources> = {}
      const errs: string[] = []
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') (next as Record<string, unknown>)[keys[i]] = r.value
        else errs.push(`${keys[i]}: ${(r.reason as Error)?.message ?? 'unavailable'}`)
      })
      setData(next as Partial<Pick<Sources, K>>)
      setErrors(errs)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [sig, version]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, errors }
}
