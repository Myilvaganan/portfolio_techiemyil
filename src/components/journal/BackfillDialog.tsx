import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { diffBackfill, loadBackfillPlan, type BackfillBroker } from '@/lib/journalBackfill'
import { fetchJournal, importTrades, type ImportResult } from '@/lib/journalStore'
import { useMoney } from '@/lib/privacy'
import type { Trade } from '@/lib/journal'
import { Amount } from './parts'

const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export interface ImportSummary extends ImportResult {
  /** Close date of the most recent trade sent, so the page can jump to it. */
  latestDate: string
}

function BackfillBody({ asOf, onImported, onClose }: { asOf: string; onImported: (summary: ImportSummary) => void; onClose: () => void }) {
  const m = useMoney()
  const [plan, setPlan] = useState<BackfillBroker[]>([])
  const [journalTrades, setJournalTrades] = useState<Trade[]>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([loadBackfillPlan(asOf), fetchJournal()])
      .then(([brokers, journal]) => {
        if (cancelled) return
        setPlan(brokers)
        setJournalTrades(journal.trades)
        setChosen(new Set(brokers.map((b) => b.id)))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not read your Options Analytics trades.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [asOf, attempt])

  // What each broker would actually add: its closed trades that aren't in the journal yet.
  const { rows, outdated } = useMemo(() => diffBackfill(plan, journalTrades), [plan, journalTrades])
  const toImport = useMemo(() => rows.filter((r) => chosen.has(r.broker.id)).flatMap((r) => r.fresh), [rows, chosen])

  async function run() {
    setImporting(true)
    setError(null)
    try {
      const outcome = await importTrades(toImport)
      const summary = { ...outcome, latestDate: toImport.map((t) => t.date).sort().pop() ?? '' }
      setResult(summary)
      onImported(summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The import failed. Nothing was changed — please try again.')
    } finally {
      setImporting(false)
    }
  }

  if (result) {
    return (
      <div className="space-y-4 py-2 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-positive" />
        <div>
          <p className="font-display text-lg font-semibold text-text">Added {plural(result.added, 'trade')} to your journal</p>
          {result.skipped > 0 && <p className="mt-1 text-sm text-text-secondary">{plural(result.skipped, 'trade')} were already there and were left as they are.</p>}
          {result.invalid > 0 && <p className="mt-1 text-sm text-error">{plural(result.invalid, 'trade')} could not be imported.</p>}
          <p className="mt-2 text-sm text-text-secondary">Open a day in the calendar to add a strategy, emotion, mistakes and notes to each one.</p>
        </div>
        <Button type="button" size="sm" magnetic={false} onClick={onClose}>
          Done
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading your Options Analytics trades…
      </p>
    )
  }

  if (error && plan.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p role="alert" className="max-w-sm text-sm text-error">
          {error}
        </p>
        <Button type="button" size="sm" variant="secondary" magnetic={false} onClick={() => setAttempt((n) => n + 1)}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
      </div>
    )
  }

  if (plan.length === 0) {
    return (
      <div className="space-y-3 py-6 text-center text-sm text-text-secondary">
        <p>No closed options trades were found in Options Analytics yet.</p>
        <p>
          Import a tradebook there first, then come back.{' '}
          <Link to="/admin/options-analytics" onClick={onClose} className="text-accent underline-offset-2 hover:underline">
            Open Options Analytics
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Copy the closed trades from Options Analytics into your journal. Running this again only adds trades that aren’t there yet — anything you’ve edited is left untouched.
      </p>

      <ul className="space-y-2">
        {rows.map(({ broker, fresh, already }) => {
          const on = chosen.has(broker.id)
          return (
            <li key={broker.id}>
              <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors', on ? 'border-accent/50 bg-accent/5' : 'border-border bg-surface-2')}>
                <input
                  type="checkbox"
                  checked={on}
                  aria-label={`Import ${broker.label} trades`}
                  onChange={() =>
                    setChosen((prev) => {
                      const next = new Set(prev)
                      if (next.has(broker.id)) next.delete(broker.id)
                      else next.add(broker.id)
                      return next
                    })
                  }
                  className="mt-1 accent-accent"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-sm font-medium text-text">{broker.label}</span>
                    <span className="text-xs text-text-secondary">
                      {shortDate(broker.from)} – {shortDate(broker.to)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-text-secondary">
                    {plural(broker.trades.length, 'closed trade')} · <span className="text-text">{fresh.length} new</span>
                    {already > 0 && ` · ${already} already in journal`}
                  </span>
                  <span className="mt-1 block text-xs text-text-secondary">
                    P&amp;L before fees <Amount value={broker.gross} className="text-xs" /> · fees <span className="font-mono">{m.inr(broker.fees)}</span>
                    <span className="text-text-secondary/70"> (estimated with your charge rates)</span>
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {outdated.length > 0 && (
        <div role="note" className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-text">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <p>
            {plural(outdated.length, 'trade')} imported earlier no longer match Options Analytics — its history changed after they were imported (for example a later statement filled a gap), so a new import may add a second copy. Check{' '}
            {[...new Set(outdated.map((t) => t.date))].sort().slice(0, 4).map(shortDate).join(', ')}
            {new Set(outdated.map((t) => t.date)).size > 4 ? '…' : ''} for duplicates and delete the old one.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-text-secondary">{toImport.length === 0 ? 'Everything selected is already in your journal.' : `${plural(toImport.length, 'trade')} will be added.`}</p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" magnetic={false} onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button type="button" size="sm" magnetic={false} onClick={run} disabled={importing || toImport.length === 0}>
            {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            {toImport.length === 0 ? 'Nothing to import' : `Import ${plural(toImport.length, 'trade')}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function BackfillDialog({
  open,
  onOpenChange,
  asOf,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  asOf: string
  onImported: (summary: ImportSummary) => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-native-cursor className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          data-native-cursor
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[151] max-h-[92vh] w-[94vw] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="font-display text-lg font-semibold text-text">Import from Options Analytics</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-text-secondary hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          {/* Mounted only while open, so each open re-reads the latest trades and what the journal already holds. */}
          {open && <BackfillBody asOf={asOf} onImported={onImported} onClose={() => onOpenChange(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
