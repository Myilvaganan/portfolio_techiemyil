import { useEffect, useState } from 'react'
import { diffBackfill, loadBackfillPlan } from '@/lib/journalBackfill'
import { fetchJournal } from '@/lib/journalStore'

export interface BackfillStatus {
  /** Closed Options Analytics trades that are not in the journal yet. */
  newCount: number
  /** Earlier imports that no longer match Options Analytics (possible duplicates). */
  outdatedCount: number
  checking: boolean
}

const NONE: BackfillStatus = { newCount: 0, outdatedCount: 0, checking: false }

/**
 * Quietly checks whether Options Analytics holds trades the journal doesn't, so the Import button can say so.
 * It reads every broker's fills, so it only runs when `enabled` (after the page's own data has loaded) and again
 * when `recheck` changes. Any failure just means no badge — the button itself still works.
 */
export function useBackfillStatus(asOf: string, enabled: boolean, recheck: number): BackfillStatus {
  const [status, setStatus] = useState<BackfillStatus>(NONE)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setStatus((prev) => ({ ...prev, checking: true }))
    Promise.all([loadBackfillPlan(asOf), fetchJournal()])
      .then(([plan, journal]) => {
        if (cancelled) return
        const diff = diffBackfill(plan, journal.trades)
        setStatus({ newCount: diff.rows.reduce((n, r) => n + r.fresh.length, 0), outdatedCount: diff.outdated.length, checking: false })
      })
      .catch(() => {
        if (!cancelled) setStatus(NONE)
      })
    return () => {
      cancelled = true
    }
  }, [asOf, enabled, recheck])

  return status
}
