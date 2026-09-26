import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { CheckCircle2, Loader2, PlugZap, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { KiteTokenExpiredError } from '@/lib/kite'
import { dateLabel } from '@/lib/journal'
import { NotConnectedError, syncZerodhaToJournal, type SyncResult } from '@/lib/kiteSync'
import { Amount, labelClass } from './parts'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type State =
  | { kind: 'running' }
  | { kind: 'connect'; expired: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'done'; result: SyncResult }

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-2 px-3 py-2 text-center">
      <p className="text-2xs uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{children}</p>
    </div>
  )
}

function Body({ asOf, onSynced, onClose }: { asOf: string; onSynced: (r: SyncResult) => void; onClose: () => void }) {
  const [state, setState] = useState<State>({ kind: 'running' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'running' })
    syncZerodhaToJournal(asOf)
      .then((result) => {
        if (cancelled) return
        setState({ kind: 'done', result })
        onSynced(result)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof NotConnectedError) setState({ kind: 'connect', expired: false })
        else if (err instanceof KiteTokenExpiredError) setState({ kind: 'connect', expired: true })
        else setState({ kind: 'error', message: err instanceof Error ? err.message : 'The sync failed. Nothing was changed — please try again.' })
      })
    return () => {
      cancelled = true
    }
    // onSynced is intentionally not a dependency: it is the page's handler, and re-running the sync when it changes would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOf, attempt])

  if (state.kind === 'running') {
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Fetching today’s trades from Zerodha…
      </p>
    )
  }

  if (state.kind === 'connect') {
    return (
      <div className="space-y-4 py-4 text-center">
        <PlugZap className="mx-auto h-9 w-9 text-accent" />
        <div className="space-y-1 text-sm text-text-secondary">
          <p className="font-medium text-text">{state.expired ? 'Your Zerodha session has expired' : 'Connect Zerodha first'}</p>
          <p>Kite needs a fresh sign-in each trading day. Connect on the Zerodha page, then come back here and sync.</p>
        </div>
        <Link
          to="/admin/zerodha"
          onClick={onClose}
          className="inline-flex h-11 items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-[#05130a] transition-colors hover:bg-accent-hover"
        >
          Connect Zerodha
        </Link>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p role="alert" className="max-w-sm text-sm text-error">
          {state.message}
        </p>
        <Button type="button" size="sm" variant="secondary" magnetic={false} onClick={() => setAttempt((n) => n + 1)}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
      </div>
    )
  }

  const { result: r } = state
  const t = r.today
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-positive" />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-text">
            {r.fetched === 0 ? 'No option trades from Zerodha today' : `Fetched ${plural(r.fetched, 'option fill')} from Zerodha`}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {r.fetched === 0
              ? 'Kite only reports the current trading day, so there was nothing new to add.'
              : `${r.newFills} new · ${r.tradesAdded > 0 ? `${plural(r.tradesAdded, 'closed trade')} added to your journal` : 'your journal is already up to date'}${r.tradesSkipped > 0 ? ` · ${r.tradesSkipped} already there` : ''}`}
          </p>
        </div>
      </div>

      <div>
        <p className={`${labelClass} mb-1.5`}>Today’s options report · {dateLabel(t.date)}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Closed trades">
            <span className="font-mono">{t.closed}</span>
            {t.closed > 0 && (
              <span className="block text-2xs font-normal text-text-secondary">
                {t.wins}W · {t.losses}L
              </span>
            )}
          </Stat>
          <Stat label="Gross P&L">
            <Amount value={t.gross} />
          </Stat>
          <Stat label="Fees (est.)">
            <span className="font-mono text-amber-500">{t.fees > 0 ? '-' : ''}</span>
            <Amount value={t.fees} signed={false} className="text-amber-500" />
          </Stat>
          <Stat label="Net P&L">
            <Amount value={t.net} />
          </Stat>
        </div>
      </div>

      {t.open.length > 0 && (
        <div className="rounded-xl border border-border bg-surface-2 p-3 text-xs text-text-secondary">
          <p className="mb-1 font-medium text-text">Still open — added to the journal when closed</p>
          <ul className="space-y-0.5 font-mono">
            {t.open.map((o) => (
              <li key={`${o.symbol}-${o.side}`}>
                {o.side === 'BUY' ? '▲' : '▼'} {o.symbol} × {o.qty}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" magnetic={false} onClick={() => setAttempt((n) => n + 1)}>
          <RefreshCw className="h-4 w-4" /> Sync again
        </Button>
        <Button type="button" size="sm" magnetic={false} onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}

export function ZerodhaSyncDialog({
  open,
  onOpenChange,
  asOf,
  onSynced,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  asOf: string
  onSynced: (result: SyncResult) => void
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
            <Dialog.Title className="font-display text-lg font-semibold text-text">Sync from Zerodha</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-text-secondary hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          {/* Mounted only while open: every open starts a fresh sync. */}
          {open && <Body asOf={asOf} onSynced={onSynced} onClose={() => onOpenChange(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
