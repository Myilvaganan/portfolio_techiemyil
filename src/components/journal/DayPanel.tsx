import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/utils'
import { BIASES, dateLabel, netInr, rMultiple, taxHeading, totalsOf, type DayNote, type JournalSettings, type Trade } from '@/lib/journal'
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

function TradeRow({ trade, onEdit, onDelete }: { trade: Trade; onEdit: () => void; onDelete: () => Promise<void> }) {
  const m = useMoney()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const net = netInr(trade)
  const r = rMultiple(trade)
  const native = trade.grossPnl - trade.fees

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
    <li className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-text">
            {trade.time && <span className="font-mono text-xs text-text-secondary">{trade.time}</span>}
            <span className="truncate">{trade.instrument}</span>
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', trade.direction === 'BUY' ? 'bg-positive/15 text-positive' : 'bg-error/15 text-error')}>{trade.direction}</span>
          </p>
          {trade.symbol && <p className="truncate text-xs text-text-secondary">{trade.symbol}</p>}
        </div>
        <div className="shrink-0 text-right">
          <Amount value={net} className="text-sm font-semibold" />
          {trade.currency === 'USD' && (
            <p className="font-mono text-[10px] text-text-secondary">
              {m.hidden ? `$${MASK}` : `${native < 0 ? '-' : ''}$${Math.abs(native).toFixed(2)}`}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-text-secondary">
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
      </div>

      {trade.notes && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-text-secondary">{trade.notes}</p>}

      <div className="mt-2 flex items-center justify-end gap-1">
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
        ) : (
          <>
            <button type="button" data-cursor="hover" aria-label="Edit trade" onClick={onEdit} className="rounded-md p-1.5 text-text-secondary hover:bg-surface-3 hover:text-text">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" data-cursor="hover" aria-label="Delete trade" onClick={() => setConfirming(true)} className="rounded-md p-1.5 text-text-secondary hover:bg-error/10 hover:text-error">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
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
export const PANEL_SCROLL = '2xl:max-h-[max(28rem,calc(100vh-16.5rem))] 2xl:overflow-y-auto'

interface DayPanelProps {
  date: string
  trades: Trade[]
  note: DayNote | undefined
  settings: JournalSettings
  onAdd: () => void
  onEdit: (trade: Trade) => void
  onDelete: (trade: Trade) => Promise<void>
  onSaveNote: (note: DayNote) => Promise<void>
}

export function DayPanel({ date, trades, note, settings, onAdd, onEdit, onDelete, onSaveNote }: DayPanelProps) {
  const m = useMoney()
  const totals = useMemo(() => totalsOf(trades, settings), [trades, settings])

  const warnings: string[] = []
  if (settings.dailyLossLimit > 0 && totals.net <= -settings.dailyLossLimit) warnings.push(`Daily loss limit of ${m.inr(settings.dailyLossLimit)} reached.`)
  if (settings.maxTradesPerDay > 0 && totals.trades > settings.maxTradesPerDay) warnings.push(`${totals.trades} trades — over your limit of ${settings.maxTradesPerDay} a day.`)

  return (
    <>
      <GlassCard hover={false} className={cn('p-4', PANEL_SCROLL)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-text">{dateLabel(date)}</h2>
          <p className="text-xs text-text-secondary">
            {totals.trades === 0 ? 'No trades logged' : `${totals.trades} trade${totals.trades === 1 ? '' : 's'} · ${totals.wins}W ${totals.losses}L`}
          </p>
        </div>
        <Button type="button" size="sm" magnetic={false} onClick={onAdd} className="!h-9 shrink-0 !px-4 !text-xs">
          <Plus className="h-3.5 w-3.5" />
          Add trade
        </Button>
      </div>

      {totals.trades > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2">
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

      {warnings.map((w) => (
        <p key={w} role="alert" className="mb-2 flex items-start gap-1.5 rounded-lg border border-error/30 bg-error/10 px-2.5 py-1.5 text-xs text-error">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {w}
        </p>
      ))}

      {trades.length === 0 ? (
        <Empty>Nothing traded on this day. Add a trade, or use the notes below to record why you sat out.</Empty>
      ) : (
        <ul className="space-y-2">
          {trades.map((t) => (
            <TradeRow key={t.id} trade={t} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
          ))}
        </ul>
      )}

      </GlassCard>

      <GlassCard hover={false} className={cn('p-4', PANEL_SCROLL)}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Daily journal · {dateLabel(date)}</h3>
        <DayNoteForm key={`${date}-${note ? 'saved' : 'new'}`} date={date} note={note} onSave={onSaveNote} />
      </GlassCard>
    </>
  )
}
