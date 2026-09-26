import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, FileUp, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { Trade } from '@/lib/journal'
import { fetchJournal, importTrades, saveAccount } from '@/lib/journalStore'
import { Mt5ParseError, accountFromReport, parseMt5Report, positionsToTrades, readReportFile, type Mt5Report } from '@/lib/mt5'
import { CurrencyProvider, useMoney } from '@/lib/privacy'

// Application Support is hidden in Finder, so the picker needs a hint: Cmd+Shift+G and paste this.
const MAC_REPORT_FOLDER = '~/Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/users/user/Documents'
const MAX_REPORT_CHARS = 3_000_000

export interface Mt5Imported {
  account: string
  added: number
  /** Trades that were already in the journal. */
  alreadyThere: number
  /** The newest trading day in the report, so the calendar can open on it. */
  latestDate: string
}

type Stage =
  | { kind: 'pick'; error?: string }
  | { kind: 'reading'; name: string }
  | { kind: 'preview'; report: Mt5Report; html: string; trades: Trade[]; existing: Set<string>; error?: string }
  | { kind: 'saving'; report: Mt5Report; trades: Trade[] }
  | { kind: 'done'; result: Mt5Imported; report: Mt5Report }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const part = (date: string, opts: Intl.DateTimeFormatOptions) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })

/** "Sep 22 – 25, 2026", "Sep 22 – Oct 3, 2026", or with both years when the span crosses a year. */
function periodLabel(from: string, to: string): string {
  if (from === to) return part(from, { day: 'numeric', month: 'short', year: 'numeric' })
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${part(from, { day: 'numeric', month: 'short', year: 'numeric' })} – ${part(to, { day: 'numeric', month: 'short', year: 'numeric' })}`
  if (from.slice(0, 7) === to.slice(0, 7)) return `${part(from, { month: 'short', day: 'numeric' })} – ${part(to, { day: 'numeric' })}, ${to.slice(0, 4)}`
  return `${part(from, { month: 'short', day: 'numeric' })} – ${part(to, { month: 'short', day: 'numeric' })}, ${to.slice(0, 4)}`
}

function Stat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-2 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-0.5 truncate text-base font-semibold text-text">{children}</p>
      {sub && <p className="truncate text-[11px] text-text-secondary">{sub}</p>}
    </div>
  )
}

function HowTo() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(MAC_REPORT_FOLDER)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked — the path is still on screen to select.
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2">
      <button type="button" data-cursor="hover" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-text">
        Where do I get the report?
        <ChevronDown className={cn('h-3.5 w-3.5 text-text-secondary transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-3 text-xs leading-relaxed text-text-secondary">
          <ol className="list-decimal space-y-1 pl-4">
            <li>In MetaTrader 5, open the <span className="text-text">History</span> tab (Toolbox, at the bottom) and pick the period you want, such as “All history”.</li>
            <li>Right-click anywhere in the list and choose <span className="text-text">Report → HTML</span>. The file is called <span className="font-mono text-text">ReportHistory-&lt;account&gt;.html</span>.</li>
            <li>Upload it here. You can upload a newer report any time — trades already saved are never duplicated.</li>
          </ol>
          <p>
            On a Mac the file is saved inside the MetaTrader app folder. In the file picker press <span className="font-mono text-text">⌘⇧G</span> and paste:
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5">
            <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-text">{MAC_REPORT_FOLDER}</code>
            <button type="button" data-cursor="hover" onClick={copy} aria-label="Copy folder path" className="shrink-0 rounded-md p-1.5 text-text-secondary hover:bg-surface-3 hover:text-text">
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Preview({ stage, onImport, onBack }: { stage: Extract<Stage, { kind: 'preview' }>; onImport: () => void; onBack: () => void }) {
  const m = useMoney()
  const { report, trades, existing } = stage
  const fresh = trades.filter((t) => !existing.has(t.id))
  const dates = trades.map((t) => t.date).sort()
  const net = trades.reduce((s, t) => s + t.grossPnl - t.fees, 0)
  const brokerNet = Number(report.summary['Total Net Profit'])
  const reconciles = Number.isFinite(brokerNet) && Math.abs(brokerNet - net) < 0.015
  const depositOps = report.balanceOps.filter((o) => o.type === 'balance')
  const deposits = depositOps.reduce((s, o) => s + o.amount, 0)
  const depositCount = depositOps.length
  const bySymbol = new Map<string, number>()
  for (const t of trades) bySymbol.set(t.symbol, (bySymbol.get(t.symbol) ?? 0) + 1)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-text">{report.name || 'MetaTrader 5 account'}</p>
          <p className="text-xs text-text-secondary">
            Account <span className="font-mono text-text">{report.account}</span>
            {report.server && <> · {report.server}</>}
            {report.company && <> · {report.company}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
          {[report.accountType, report.currency, report.marginMode].filter(Boolean).map((b) => (
            <span key={b} className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-text-secondary">
              {b}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Closed trades" sub={dates.length ? periodLabel(dates[0], dates[dates.length - 1]) : undefined}>
          {trades.length}
        </Stat>
        <Stat label="New to journal" sub={trades.length - fresh.length > 0 ? `${trades.length - fresh.length} already saved` : 'none saved yet'}>
          {fresh.length}
        </Stat>
        <Stat label="Net P&L">
          <span className={net > 0 ? 'text-positive' : net < 0 ? 'text-error' : ''}>{m.signed(net)}</span>
        </Stat>
        <Stat label="Deposits" sub={`${depositCount} ${depositCount === 1 ? 'entry' : 'entries'}`}>
          {m.inr(deposits)}
        </Stat>
      </div>

      {bySymbol.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {[...bySymbol].map(([symbol, count]) => (
            <span key={symbol} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-text-secondary">
              <span className="font-mono text-text">{symbol}</span> × {count}
            </span>
          ))}
        </div>
      )}

      {Number.isFinite(brokerNet) &&
        (reconciles ? (
          <p className="flex items-center gap-1.5 text-xs text-positive">
            <CheckCircle2 className="h-3.5 w-3.5" /> Matches MetaTrader’s own Total Net Profit ({m.signed(brokerNet)}).
          </p>
        ) : (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-amber-500">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The trades add up to {m.signed(net)}, but MetaTrader reports a Total Net Profit of {m.signed(brokerNet)}. Some rows may not have been read — check the report before importing.
          </p>
        ))}

      {stage.error && (
        <p role="alert" className="text-xs text-error">
          {stage.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" magnetic={false} onClick={onBack}>
          Choose a different file
        </Button>
        <Button type="button" size="sm" magnetic={false} onClick={onImport}>
          {fresh.length > 0 ? `Import ${plural(fresh.length, 'trade')}` : 'Update account details'}
        </Button>
      </div>
      {fresh.length === 0 && <p className="-mt-2 text-right text-[11px] text-text-secondary">Every trade in this report is already saved; this will refresh the balance and deposits.</p>}
    </div>
  )
}

function Body({ onImported, onClose, onBusy }: { onImported: (r: Mt5Imported) => void; onClose: () => void; onBusy: (busy: boolean) => void }) {
  const [stage, setStage] = useState<Stage>({ kind: 'pick' })
  const [dragActive, setDragActive] = useState(false)
  const dragCounter = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStage({ kind: 'reading', name: file.name })
    try {
      const html = await readReportFile(file)
      if (html.length > MAX_REPORT_CHARS) throw new Mt5ParseError('That file is larger than 3 MB, which is far more than a trade history report. Is it the right file?')
      const report = parseMt5Report(html)
      const trades = positionsToTrades(report)
      // What's already saved for this account, so the preview can say how much is genuinely new.
      const existing = new Set((await fetchJournal(undefined, undefined, report.account)).trades.map((t) => t.id))
      setStage({ kind: 'preview', report, html, trades, existing })
    } catch (err) {
      setStage({ kind: 'pick', error: err instanceof Mt5ParseError ? err.message : err instanceof Error ? err.message : 'Could not read that file.' })
    }
  }

  async function runImport() {
    if (stage.kind !== 'preview') return
    const { report, html, trades, existing } = stage
    setStage({ kind: 'saving', report, trades })
    onBusy(true)
    try {
      // Account first: if the trades then fail, retrying is safe (both steps are idempotent).
      await saveAccount(accountFromReport(report), html)
      const fresh = trades.filter((t) => !existing.has(t.id))
      const outcome = fresh.length ? await importTrades(fresh) : { added: 0, skipped: 0, invalid: 0 }
      const result: Mt5Imported = {
        account: report.account,
        added: outcome.added,
        alreadyThere: trades.length - fresh.length + outcome.skipped,
        latestDate: trades.map((t) => t.date).sort().pop() ?? '',
      }
      setStage({ kind: 'done', result, report })
      onImported(result)
    } catch (err) {
      setStage({ kind: 'preview', report, html, trades, existing, error: err instanceof Error ? err.message : 'The import failed. Nothing was lost — please try again.' })
    } finally {
      onBusy(false)
    }
  }

  const drag = (e: DragEvent, delta: number) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = Math.max(0, dragCounter.current + delta)
    setDragActive(dragCounter.current > 0)
  }
  const drop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  if (stage.kind === 'reading') {
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading {stage.name}…
      </p>
    )
  }

  if (stage.kind === 'saving') {
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Saving account {stage.report.account} and {plural(stage.trades.length, 'trade')}…
      </p>
    )
  }

  if (stage.kind === 'preview') {
    return (
      <CurrencyProvider value={stage.report.currency || 'USD'}>
        <Preview stage={stage} onImport={runImport} onBack={() => setStage({ kind: 'pick' })} />
      </CurrencyProvider>
    )
  }

  if (stage.kind === 'done') {
    const { result, report } = stage
    return (
      <div className="space-y-4 py-2 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-positive" />
        <div className="space-y-1">
          <p className="font-display text-lg font-semibold text-text">
            {result.added > 0 ? `Added ${plural(result.added, 'trade')} to account ${report.account}` : `Account ${report.account} is up to date`}
          </p>
          {result.alreadyThere > 0 && <p className="text-sm text-text-secondary">{plural(result.alreadyThere, 'trade')} {result.alreadyThere === 1 ? 'was' : 'were'} already saved and left as {result.alreadyThere === 1 ? 'it is' : 'they are'}.</p>}
          <p className="text-sm text-text-secondary">Open a day in the calendar to add a strategy, your emotions and notes to each trade.</p>
        </div>
        <Button type="button" size="sm" magnetic={false} onClick={onClose}>
          View my calendar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        Upload the <span className="text-text">Trade History Report</span> from MetaTrader 5. It’s read right here in your browser; you’ll see what it contains before anything is saved.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".html,.htm,text/html"
        aria-label="MetaTrader 5 report file"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void handleFile(file)
        }}
      />
      <button
        type="button"
        data-cursor="hover"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => drag(e, 1)}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => drag(e, -1)}
        onDrop={drop}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors',
          dragActive ? 'border-accent bg-accent/10' : 'border-border bg-surface-2 hover:border-accent/40',
        )}
      >
        <FileUp className={cn('h-8 w-8', dragActive ? 'text-accent' : 'text-text-secondary')} />
        <span className="text-sm text-text">
          <span className="font-medium text-accent">Choose your report</span> or drag it here
        </span>
        <span className="text-xs text-text-secondary">ReportHistory-….html</span>
      </button>

      {stage.error && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-error">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {stage.error}
        </p>
      )}

      <HowTo />
    </div>
  )
}

export function Mt5UploadDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (result: Mt5Imported) => void
}) {
  // Closing mid-save could leave the account saved but its trades not; hold the dialog until the save settles.
  const [busy, setBusy] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (busy && !next ? undefined : onOpenChange(next))}>
      <Dialog.Portal>
        <Dialog.Overlay data-native-cursor className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          data-native-cursor
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[151] max-h-[92vh] w-[94vw] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="font-display text-lg font-semibold text-text">Upload MetaTrader 5 report</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className={cn('text-text-secondary hover:text-text', busy && 'pointer-events-none opacity-40')}>
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          {/* Mounted only while open, so every open starts from the file picker. */}
          {open && <Body onImported={onImported} onClose={() => onOpenChange(false)} onBusy={setBusy} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

