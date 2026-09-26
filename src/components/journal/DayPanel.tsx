import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/utils'
import { BIASES, dateLabel, fxOf, netInr, rMultiple, taxHeading, totalsOf, type DayNote, type JournalSettings, type Trade } from '@/lib/journal'
import { MASK, useMoney } from '@/lib/privacy'
import { Amount, Chip, Empty, Field, StarRating, inputClass, labelClass, tone } from './parts'

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-2 p-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{children}</p>
    </div>
  )
}

const price = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 5 })

/** "0.01 lot · 85,866.5 → 85,901.5 · SL 85,000" — what was traded and at what prices, when the trade has them. */
function tradeDetail(trade: Trade): string {
  const parts: string[] = []
  if (trade.qty > 0) parts.push((trade.source ?? '').startsWith('mt5:') ? `${trade.qty} lot${trade.qty === 1 ? '' : 's'}` : `${trade.qty} units`)
  if (trade.entry !== null && trade.exit !== null) parts.push(`${price(trade.entry)} → ${price(trade.exit)}`)
  if (trade.stopLoss !== null) parts.push(`SL ${price(trade.stopLoss)}`)
  if (trade.target !== null) parts.push(`TP ${price(trade.target)}`)
  return parts.join(' · ')
}

function TradeRow({ trade, onEdit, onDelete, readOnly }: { trade: Trade; onEdit: () => void; onDelete: () => Promise<void>; readOnly?: boolean }) {
  const m = useMoney()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const net = netInr(trade)
  const r = rMultiple(trade)
  const native = trade.grossPnl - trade.fees
  const detail = tradeDetail(trade)

  async function remove() {
    setBusy(true)
    try {
      await onDelete()
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <li className="rounded-xl border border-border bg-surface-2 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-text">
            {trade.time && <span className="font-mono text-xs text-text-secondary">{trade.time}</span>}
            <span className="truncate">{trade.instrument}</span>
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', trade.direction === 'BUY' ? 'bg-positive/15 text-positive' : 'bg-error/15 text-error')}>{trade.direction}</span>
          </p>
          {trade.symbol && <p className="truncate text-xs text-text-secondary">{trade.symbol}</p>}
          {detail && <p className="mt-0.5 truncate font-mono text-[11px] text-text-secondary/80">{detail}</p>}
        </div>
        <div className="shrink-0 text-right">
          <Amount value={net} className="text-sm font-semibold" />
          {trade.currency === 'USD' && fxOf(trade) !== 1 && (
            <p className="font-mono text-[10px] text-text-secondary">
              {m.hidden ? `$${MASK}` : `${native < 0 ? '-' : ''}$${Math.abs(native).toFixed(2)}`}
            </p>
          )}
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-text-secondary">
        {(trade.source ?? '').startsWith('mt5:') && (
          <span title="From your MetaTrader 5 report" className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-accent">
            MT5
          </span>
        )}
        {(trade.source ?? '').startsWith('options-analytics') && (
          <span title="Copied from Options Analytics" className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-accent">
            imported
          </span>
        )}
        {trade.strategy && <span className="rounded-full border border-border px-2 py-0.5">{trade.strategy}</span>}
        {trade.emotion && <span className="rounded-full border border-border px-2 py-0.5">{trade.emotion}</span>}
        {r !== null && <span className={cn('rounded-full border border-border px-2 py-0.5 font-mono', tone(r))}>{`${r >= 0 ? '+' : ''}${r.toFixed(2)}R`}</span>}
        {trade.followedPlan === true && <span className="text-positive">✓ plan</span>}
        {trade.followedPlan === false && <span className="text-error">✗ plan</span>}
        {trade.rating > 0 && <span className="text-amber-400">{'★'.repeat(trade.rating)}</span>}
        {trade.mistakes.map((x) => (
          <span key={x} className="rounded-full bg-error/10 px-2 py-0.5 text-error">
            {x}
          </span>
        ))}
        {trade.tags.map((x) => (
          <span key={x} className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-accent">
            #{x}
          </span>
        ))}
        <div className="ml-auto flex items-center gap-0.5">
        {confirming ? (
          <>
            <span className="mr-1 text-xs text-text-secondary">Delete this trade?</span>
            <button type="button" data-cursor="hover" aria-label="Confirm delete" disabled={busy} onClick={remove} className="rounded-md p-1.5 text-error hover:bg-error/10">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button type="button" data-cursor="hover" aria-label="Cancel delete" disabled={busy} onClick={() => setConfirming(false)} className="rounded-md p-1.5 text-text-secondary hover:bg-surface-3">
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : readOnly ? null : (
          <>
            <button type="button" data-cursor="hover" aria-label="Edit trade" onClick={onEdit} className="rounded-md p-1 text-text-secondary hover:bg-surface-3 hover:text-text">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" data-cursor="hover" aria-label="Delete trade" onClick={() => setConfirming(true)} className="rounded-md p-1 text-text-secondary hover:bg-error/10 hover:text-error">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      </div>

      {trade.notes && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-text-secondary">{trade.notes}</p>}

    </li>
  )
}

function blankNote(date: string): DayNote {
  return { date, bias: '', plan: '', review: '', lessons: '', mood: 0, discipline: 0 }
}

// Keyed by date in the parent, so switching days always starts from that day's saved note.
function DayNoteForm({ date, note, onSave }: { date: string; note: DayNote | undefined; onSave: (note: DayNote) => Promise<void> }) {
  const [draft, setDraft] = useState<DayNote>(note ?? blankNote(date))
  const [saved, setSaved] = useState<DayNote>(note ?? blankNote(date))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const set = <K extends keyof DayNote>(key: K, value: DayNote[K]) => setDraft((prev) => ({ ...prev, [key]: value }))

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
      setSaved(draft)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the notes.')
    } finally {
      setSaving(false)
    }
  }

  const area = (label: string, key: 'plan' | 'review' | 'lessons', placeholder: string, rows = 3) => (
    <Field label={label}>
      <textarea rows={rows} className={cn(inputClass, 'resize-y')} value={draft[key]} placeholder={placeholder} onChange={(e) => set(key, e.target.value)} />
    </Field>
  )

  return (
    <div className="space-y-3">
      <div>
        <span className={labelClass}>Market bias</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {BIASES.map((b) => (
            <Chip key={b} active={draft.bias === b} onClick={() => set('bias', draft.bias === b ? '' : b)}>
              {b}
            </Chip>
          ))}
        </div>
      </div>
      {area('Pre-market plan', 'plan', 'Levels, setups you will take, max risk today…')}
      {area('Post-market review', 'review', 'What happened? Did you stick to the plan?')}
      {area('Lesson for tomorrow', 'lessons', 'One thing to repeat, one thing to stop.', 2)}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className={labelClass}>Mood</span>
          <StarRating label="Mood" value={draft.mood} onChange={(n) => set('mood', n)} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelClass}>Discipline</span>
          <StarRating label="Discipline" value={draft.discipline} onChange={(n) => set('discipline', n)} />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
      <Button type="button" size="sm" magnetic={false} disabled={!dirty || saving} onClick={save} className="w-full">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {dirty || saving ? 'Save day notes' : 'Day notes saved'}
      </Button>
    </div>
  )
}

// On very wide screens the two cards sit side by side and scroll on their own, so the page itself never has to.
// --journal-chrome is how much vertical room the page's own header takes; the Forex page's account card needs more.
// The trades card keeps its header and totals in view and scrolls only the trades, so the scrollbar sits inside the card.
const TRADES_CARD = '2xl:flex 2xl:max-h-[max(28rem,calc(100vh-var(--journal-chrome,16.5rem)))] 2xl:flex-col 2xl:overflow-hidden'
const TRADES_SCROLL = '2xl:min-h-0 2xl:flex-1 2xl:overflow-y-auto 2xl:pr-1'
export const PANEL_SCROLL = '2xl:max-h-[max(28rem,calc(100vh-var(--journal-chrome,16.5rem)))] 2xl:overflow-y-auto'

interface DayPanelProps {
  date: string
  trades: Trade[]
  note: DayNote | undefined
  settings: JournalSettings
  onAdd: () => void
  onEdit: (trade: Trade) => void
  onDelete: (trade: Trade) => Promise<void>
  onSaveNote: (note: DayNote) => Promise<void>
  /** Previous / next day. Omit to hide the arrows. */
  onStep?: (delta: number) => void
  /** The combined view: trades are shown but can't be edited, and there are no day notes (they belong to one journal). */
  readOnly?: boolean
}

export function DayPanel({ date, trades, note, settings, onAdd, onEdit, onDelete, onSaveNote, onStep, readOnly = false }: DayPanelProps) {
  const m = useMoney()
  const totals = useMemo(() => totalsOf(trades, settings), [trades, settings])

  const warnings: string[] = []
  if (settings.dailyLossLimit > 0 && totals.net <= -settings.dailyLossLimit) warnings.push(`Daily loss limit of ${m.inr(settings.dailyLossLimit)} reached.`)
  if (settings.maxTradesPerDay > 0 && totals.trades > settings.maxTradesPerDay) warnings.push(`${totals.trades} trades — over your limit of ${settings.maxTradesPerDay} a day.`)
  if (settings.maxConsecutiveLosses > 0) {
    let run = 0
    let worst = 0
    for (const tr of trades) {
      run = netInr(tr) < 0 ? run + 1 : 0
      worst = Math.max(worst, run)
    }
    if (worst >= settings.maxConsecutiveLosses) warnings.push(`${worst} losses in a row — over your limit of ${settings.maxConsecutiveLosses}. Consider stepping away.`)
  }

  return (
    <>
      <GlassCard hover={false} className={cn('p-4', TRADES_CARD)}>
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-1.5">
          {onStep && (
            <button type="button" data-cursor="hover" aria-label="Previous day" onClick={() => onStep(-1)} className="mt-0.5 rounded-full border border-border p-1 text-text-secondary hover:border-accent/40 hover:text-text">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-text">{dateLabel(date)}</h2>
          <p className="text-xs text-text-secondary">
            {totals.trades === 0 ? 'No trades logged' : `${totals.trades} trade${totals.trades === 1 ? '' : 's'} · ${totals.wins}W ${totals.losses}L`}
          </p>
          </div>
          {onStep && (
            <button type="button" data-cursor="hover" aria-label="Next day" onClick={() => onStep(1)} className="mt-0.5 rounded-full border border-border p-1 text-text-secondary hover:border-accent/40 hover:text-text">
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
        {!readOnly && (
          <Button type="button" size="sm" magnetic={false} onClick={onAdd} className="!h-9 shrink-0 !px-4 !text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add trade
          </Button>
        )}
      </div>

      {totals.trades > 0 && (
        <div className="mb-3 grid shrink-0 grid-cols-3 gap-2">
          <Tile label="Before tax">
            <Amount value={totals.net} />
          </Tile>
          <Tile label={taxHeading(settings)}>
            <span className="font-mono text-amber-500">{totals.tax > 0 ? `-${m.inr(totals.tax)}` : m.inr(0)}</span>
          </Tile>
          <Tile label="After tax">
            <Amount value={totals.afterTax} />
          </Tile>
        </div>
      )}

      <div className={TRADES_SCROLL}>
      {warnings.map((w) => (
        <p key={w} role="alert" className="mb-2 flex items-start gap-1.5 rounded-lg border border-error/30 bg-error/10 px-2.5 py-1.5 text-xs text-error">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {w}
        </p>
      ))}

      {trades.length === 0 ? (
        <Empty>{readOnly ? 'Nothing traded on this day.' : 'Nothing traded on this day. Add a trade, or use the notes below to record why you sat out.'}</Empty>
      ) : (
        <ul className="space-y-2">
          {trades.map((t) => (
            <TradeRow key={t.id} trade={t} readOnly={readOnly} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
          ))}
        </ul>
      )}
      </div>

      </GlassCard>

      {!readOnly && (
      <GlassCard hover={false} className={cn('p-4', PANEL_SCROLL)}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Daily journal · {dateLabel(date)}</h3>
        <DayNoteForm key={`${date}-${note ? 'saved' : 'new'}`} date={date} note={note} onSave={onSaveNote} />
      </GlassCard>
      )}
    </>
  )
}
