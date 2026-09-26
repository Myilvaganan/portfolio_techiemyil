import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  EMOTIONS,
  INSTRUMENT_PRESETS,
  MISTAKES,
  STRATEGIES,
  fxOf,
  grossFromPrices,
  netInr,
  rMultiple,
  taxOn,
  taxRuleFor,
  type Currency,
  type Direction,
  type JournalSettings,
  type Trade,
} from '@/lib/journal'
import { Amount, Chip, Field, StarRating, inputClass, labelClass } from './parts'

interface FormState {
  date: string
  time: string
  instrument: string
  symbol: string
  direction: Direction
  currency: Currency
  fxRate: string
  qty: string
  contractSize: string
  entry: string
  exit: string
  stopLoss: string
  target: string
  manualPnl: boolean
  grossManual: string
  fees: string
  strategy: string
  emotion: string
  mistakes: string[]
  tags: string[]
  followedPlan: boolean | null
  rating: number
  notes: string
}

const str = (n: number | null) => (n === null || n === undefined ? '' : String(n))
const parse = (s: string) => (s.trim() === '' ? NaN : Number(s))
const optional = (s: string) => {
  const n = parse(s)
  return Number.isFinite(n) ? n : null
}

function toForm(t: Trade, usdInr: number): FormState {
  // A saved trade without prices can only have been entered as a P&L figure.
  const manual = t.manualPnl || (grossFromPrices(t) === null && t.grossPnl !== 0)
  return {
    date: t.date,
    time: t.time,
    instrument: t.instrument,
    symbol: t.symbol,
    direction: t.direction,
    currency: t.currency,
    fxRate: t.currency === 'USD' ? String(t.fxRate) : String(usdInr),
    qty: t.qty > 0 ? String(t.qty) : '',
    contractSize: String(t.contractSize),
    entry: str(t.entry),
    exit: str(t.exit),
    stopLoss: str(t.stopLoss),
    target: str(t.target),
    manualPnl: manual,
    grossManual: manual ? String(t.grossPnl) : '',
    fees: t.fees > 0 ? String(t.fees) : '',
    strategy: t.strategy,
    emotion: t.emotion,
    mistakes: t.mistakes,
    tags: t.tags,
    followedPlan: t.followedPlan,
    rating: t.rating,
    notes: t.notes,
  }
}

function toTrade(f: FormState, base: Trade, gross: number): Trade {
  const usd = f.currency === 'USD'
  return {
    ...base,
    date: f.date,
    time: f.time,
    instrument: f.instrument.trim(),
    symbol: f.symbol.trim(),
    direction: f.direction,
    currency: f.currency,
    fxRate: usd ? parse(f.fxRate) : 1,
    qty: Number.isFinite(parse(f.qty)) ? parse(f.qty) : 0,
    contractSize: parse(f.contractSize) > 0 ? parse(f.contractSize) : 1,
    entry: optional(f.entry),
    exit: optional(f.exit),
    stopLoss: optional(f.stopLoss),
    target: optional(f.target),
    manualPnl: f.manualPnl,
    grossPnl: gross,
    fees: Number.isFinite(parse(f.fees)) ? parse(f.fees) : 0,
    strategy: f.strategy.trim(),
    emotion: f.emotion,
    mistakes: f.mistakes,
    tags: f.tags,
    followedPlan: f.followedPlan,
    rating: f.rating,
    notes: f.notes.trim(),
  }
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; tone?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="grid overflow-hidden rounded-lg border border-border text-sm font-semibold" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          data-cursor="hover"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn('py-1.5 transition-colors', value === o.id ? (o.tone ?? 'bg-accent/15 text-accent') : 'bg-surface-2 text-text-secondary hover:text-text')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Free-text setup tags shown as chips, added by typing and pressing Enter/comma (e.g. "earnings", "gap-up"). */
function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('')

  function commit() {
    const value = draft.trim().replace(/^#/, '')
    if (value && !tags.some((t) => t.toLowerCase() === value.toLowerCase())) onChange([...tags, value].slice(0, 12))
    setDraft('')
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            data-cursor="hover"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs text-accent"
            title="Remove tag"
          >
            #{t} <X className="h-3 w-3 opacity-70" />
          </button>
        ))}
        <input
          value={draft}
          placeholder="Add a tag, press Enter"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commit()
            }
          }}
          onBlur={commit}
          className="min-w-[8rem] flex-1 rounded-full border border-dashed border-border bg-surface-2 px-2.5 py-1 text-xs text-text outline-none placeholder:text-text-secondary/60 focus:border-accent/50"
        />
      </div>
    </div>
  )
}

function GroupTitle({ children }: { children: string }) {
  return <p className="mb-2 mt-1 border-b border-border pb-1 text-[11px] font-semibold uppercase tracking-wide text-accent/80">{children}</p>
}

function TradeForm({
  initial,
  settings,
  usdInr,
  knownInstruments,
  knownStrategies,
  onSave,
  onClose,
}: {
  initial: Trade
  settings: JournalSettings
  usdInr: number
  knownInstruments: string[]
  knownStrategies: string[]
  onSave: (trade: Trade, previousDate?: string) => Promise<void>
  onClose: () => void
}) {
  const [f, setF] = useState<FormState>(() => toForm(initial, usdInr))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = Boolean(initial.createdAt)
  // A trade on a Forex account is always in that account's currency, so there is nothing to convert or choose.
  const accountTrade = Boolean(initial.account)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((prev) => ({ ...prev, [key]: value }))

  function pickInstrument(name: string) {
    setF((prev) => {
      const preset = INSTRUMENT_PRESETS.find((p) => p.name.toLowerCase() === name.trim().toLowerCase())
      return preset ? { ...prev, instrument: name, currency: preset.currency, contractSize: String(preset.contractSize) } : { ...prev, instrument: name }
    })
  }

  const auto = grossFromPrices({
    direction: f.direction,
    entry: optional(f.entry),
    exit: optional(f.exit),
    qty: Number.isFinite(parse(f.qty)) ? parse(f.qty) : 0,
    contractSize: parse(f.contractSize) > 0 ? parse(f.contractSize) : 1,
  })
  const gross = f.manualPnl ? parse(f.grossManual) : auto

  // A throwaway trade purely to reuse the app's own net / tax / R maths for the live preview.
  const preview = useMemo(() => {
    if (gross === null || !Number.isFinite(gross)) return null
    const t = toTrade(f, initial, gross)
    const net = netInr(t)
    return { t, net, afterTax: net - taxOn([t], settings), r: rMultiple(t) }
  }, [f, gross, initial, settings])

  const instrumentOptions = useMemo(() => [...new Set([...INSTRUMENT_PRESETS.map((p) => p.name), ...knownInstruments])], [knownInstruments])
  const strategyOptions = useMemo(() => [...new Set([...STRATEGIES, ...knownStrategies])], [knownStrategies])
  const mistakeOptions = useMemo(() => [...new Set([...MISTAKES, ...f.mistakes])], [f.mistakes])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.date) return setError('Pick the trade date.')
    if (!f.instrument.trim()) return setError('Enter the instrument (for example Options or XAUUSD).')
    if (gross === null || !Number.isFinite(gross)) {
      return setError(f.manualPnl ? 'Enter the P&L for this trade.' : 'Enter entry, exit and quantity — or switch to typing the P&L yourself.')
    }
    if (f.currency === 'USD' && !(parse(f.fxRate) >= 1)) return setError('Enter the USD → INR rate for this trade.')

    setSaving(true)
    setError(null)
    try {
      await onSave(toTrade(f, initial, gross), isEdit ? initial.date : undefined)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this trade. Please try again.')
      setSaving(false)
    }
  }

  const symbol = f.currency === 'USD' ? '$' : '₹'

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {/* Phones: one scrolling column. lg+: two columns so the whole form is visible without scrolling. */}
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8 lg:space-y-0">
      <div className="space-y-4">
      <div>
        <GroupTitle>Trade</GroupTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Date">
            <input type="date" className={inputClass} value={f.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Time" hint="(optional)">
            <input type="time" className={inputClass} value={f.time} onChange={(e) => set('time', e.target.value)} />
          </Field>
          <Field label="Instrument" className="col-span-2">
            <input
              list="journal-instruments"
              className={inputClass}
              value={f.instrument}
              placeholder="Options, Bitcoin, XAUUSD…"
              onChange={(e) => pickInstrument(e.target.value)}
            />
            <datalist id="journal-instruments">
              {instrumentOptions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
          <Field label="Symbol / contract" hint="(optional)" className="col-span-2">
            <input className={inputClass} value={f.symbol} placeholder="NIFTY 25000 CE" onChange={(e) => set('symbol', e.target.value)} />
          </Field>
          <div className="col-span-2 flex flex-col gap-1">
            <span className={labelClass}>Direction</span>
            <Segmented
              label="Direction"
              value={f.direction}
              onChange={(v) => set('direction', v)}
              options={[
                { id: 'BUY', label: '▲ BUY / LONG' },
                { id: 'SELL', label: '▼ SELL / SHORT', tone: 'bg-error/15 text-error' },
              ]}
            />
          </div>
        </div>
      </div>

      <div>
        <GroupTitle>Size & prices</GroupTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {!accountTrade && (
            <>
              <div className="flex flex-col gap-1">
                <span className={labelClass}>Currency</span>
                <Segmented label="Currency" value={f.currency} onChange={(v) => set('currency', v)} options={[{ id: 'INR', label: '₹ INR' }, { id: 'USD', label: '$ USD' }]} />
              </div>
              {f.currency === 'USD' ? (
                <Field label="1 USD = ₹" hint="rate">
                  <input type="number" step="0.01" className={inputClass} value={f.fxRate} onChange={(e) => set('fxRate', e.target.value)} />
                </Field>
              ) : (
                <div className="hidden sm:block" />
              )}
            </>
          )}
          <Field label="Quantity" hint="(units / lots)">
            <input type="number" step="any" className={inputClass} value={f.qty} onChange={(e) => set('qty', e.target.value)} />
          </Field>
          <Field label="Contract size" hint="per lot">
            <input type="number" step="any" className={inputClass} value={f.contractSize} onChange={(e) => set('contractSize', e.target.value)} />
          </Field>
          <Field label="Entry">
            <input type="number" step="any" className={inputClass} value={f.entry} onChange={(e) => set('entry', e.target.value)} />
          </Field>
          <Field label="Exit">
            <input type="number" step="any" className={inputClass} value={f.exit} onChange={(e) => set('exit', e.target.value)} />
          </Field>
          <Field label="Stop loss" hint="(for R)">
            <input type="number" step="any" className={inputClass} value={f.stopLoss} onChange={(e) => set('stopLoss', e.target.value)} />
          </Field>
          <Field label="Target" hint="(planned)">
            <input type="number" step="any" className={inputClass} value={f.target} onChange={(e) => set('target', e.target.value)} />
          </Field>
        </div>
      </div>

      <div>
        <GroupTitle>Result</GroupTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2 flex flex-col gap-1">
            <span className={labelClass}>Gross P&amp;L ({symbol})</span>
            {f.manualPnl ? (
              <input
                aria-label="Gross P&L"
                type="number"
                step="any"
                className={inputClass}
                value={f.grossManual}
                placeholder="e.g. 1500 or -800"
                onChange={(e) => set('grossManual', e.target.value)}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-border bg-surface-2 px-2.5 py-1.5 font-mono text-sm text-text-secondary">
                {auto === null ? 'from entry × exit × qty' : `${auto < 0 ? '-' : ''}${symbol}${Math.abs(auto).toLocaleString('en-IN')}`}
              </p>
            )}
            <label className="mt-0.5 flex cursor-pointer items-center gap-1.5 text-[11px] text-text-secondary">
              <input
                type="checkbox"
                checked={f.manualPnl}
                onChange={(e) => setF((prev) => ({ ...prev, manualPnl: e.target.checked, grossManual: e.target.checked && auto !== null ? String(auto) : prev.grossManual }))}
                className="accent-accent"
              />
              Type the P&amp;L myself (e.g. from my broker statement)
            </label>
          </div>
          <Field label={`Fees & charges (${symbol})`} className="col-span-2">
            <input type="number" step="any" className={inputClass} value={f.fees} placeholder="brokerage, STT, GST…" onChange={(e) => set('fees', e.target.value)} />
          </Field>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface-2 p-3 text-center sm:grid-cols-4" aria-live="polite">
          <PreviewCell label="Net (before tax)" node={preview ? <Amount value={preview.net} /> : <span className="text-text-secondary">—</span>} />
          <PreviewCell label={taxRuleFor(settings, f.instrument).rate > 0 ? `After ${taxRuleFor(settings, f.instrument).rate}% tax` : 'After tax'} node={preview ? <Amount value={preview.afterTax} /> : <span className="text-text-secondary">—</span>} />
          <PreviewCell label="R-multiple" node={<span className="font-mono">{preview?.r != null ? `${preview.r >= 0 ? '+' : ''}${preview.r.toFixed(2)}R` : '—'}</span>} />
          {!accountTrade && <PreviewCell label="In INR" node={<span className="font-mono text-text-secondary">{preview ? `×${fxOf(preview.t).toFixed(f.currency === 'USD' ? 2 : 0)}` : '—'}</span>} />}
        </div>
      </div>

      </div>
      <div className="space-y-4">
      <div>
        <GroupTitle>Review</GroupTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Strategy / setup" className="col-span-2">
            <input list="journal-strategies" className={inputClass} value={f.strategy} placeholder="Breakout, Pullback…" onChange={(e) => set('strategy', e.target.value)} />
            <datalist id="journal-strategies">
              {strategyOptions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
          <Field label="How did you feel?" className="col-span-2">
            <select className={inputClass} value={f.emotion} onChange={(e) => set('emotion', e.target.value)}>
              <option value="" className="bg-card">
                Select…
              </option>
              {EMOTIONS.map((o) => (
                <option key={o} value={o} className="bg-card">
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <div className="col-span-2 flex flex-col gap-1">
            <span className={labelClass}>Did you follow your plan?</span>
            <Segmented
              label="Followed plan"
              value={f.followedPlan === null ? 'na' : f.followedPlan ? 'yes' : 'no'}
              onChange={(v) => set('followedPlan', v === 'na' ? null : v === 'yes')}
              options={[
                { id: 'yes', label: 'Yes', tone: 'bg-positive/15 text-positive' },
                { id: 'no', label: 'No', tone: 'bg-error/15 text-error' },
                { id: 'na', label: '—' },
              ]}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <span className={labelClass}>Execution quality</span>
            <StarRating label="Execution quality" value={f.rating} onChange={(n) => set('rating', n)} />
          </div>
        </div>

        <div className="mt-3">
          <span className={labelClass}>Mistakes</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {mistakeOptions.map((m) => (
              <Chip key={m} active={f.mistakes.includes(m)} onClick={() => set('mistakes', f.mistakes.includes(m) ? f.mistakes.filter((x) => x !== m) : [...f.mistakes, m])}>
                {m}
              </Chip>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <span className={labelClass}>Setup tags</span>
          <TagInput tags={f.tags} onChange={(tags) => set('tags', tags)} />
        </div>

        <Field label="Notes" hint="why you took it, what you saw, what you'd change" className="mt-3">
          <textarea rows={3} className={cn(inputClass, 'resize-y')} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>

      </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" magnetic={false} onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" magnetic={false} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? 'Save changes' : 'Add trade'}
        </Button>
      </div>
    </form>
  )
}

function PreviewCell({ label, node }: { label: string; node: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{node}</p>
    </div>
  )
}

export function TradeDialog({
  open,
  onOpenChange,
  trade,
  ...rest
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The trade to edit, or a blank one (no createdAt) to add. */
  trade: Trade | null
  settings: JournalSettings
  usdInr: number
  knownInstruments: string[]
  knownStrategies: string[]
  onSave: (trade: Trade, previousDate?: string) => Promise<void>
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-native-cursor className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          data-native-cursor
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[151] max-h-[96vh] w-[94vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl lg:max-w-5xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="font-display text-lg font-semibold text-text">{trade?.createdAt ? 'Edit trade' : 'Add trade'}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-text-secondary hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          {/* Mounted only while open, so every open starts from a fresh form. */}
          {trade && <TradeForm initial={trade} {...rest} onClose={() => onOpenChange(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
