import { useMemo, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { INSTRUMENT_PRESETS, instrumentKey, type JournalSettings, type TaxMode, type TaxRule } from '@/lib/journal'
import { Field, inputClass } from './parts'

const TAX_MODES: { id: TaxMode; title: string; text: string }[] = [
  { id: 'per-trade', title: 'On each winning trade', text: 'Every profitable trade is taxed and losses cannot offset it (the flat-rate rule used for crypto / VDA).' },
  { id: 'net', title: 'On net profit', text: 'Tax is charged on the net profit, so losses reduce the tax (business-income style, e.g. options).' },
]

interface RuleRow {
  instrument: string
  rate: string
  mode: TaxMode
}

const groupTitle = 'mb-2 text-[11px] font-semibold uppercase tracking-wide text-accent/80'

function SettingsForm({
  settings,
  knownInstruments,
  onSave,
  onClose,
}: {
  settings: JournalSettings
  knownInstruments: string[]
  onSave: (s: JournalSettings) => Promise<void>
  onClose: () => void
}) {
  const [rate, setRate] = useState(String(settings.taxRate))
  const [mode, setMode] = useState<TaxMode>(settings.taxMode)
  const [rules, setRules] = useState<RuleRow[]>(() => settings.taxRules.map((r) => ({ instrument: r.instrument, rate: String(r.rate), mode: r.mode })))
  const [capital, setCapital] = useState(settings.startingCapital ? String(settings.startingCapital) : '')
  const [lossLimit, setLossLimit] = useState(settings.dailyLossLimit ? String(settings.dailyLossLimit) : '')
  const [maxTrades, setMaxTrades] = useState(settings.maxTradesPerDay ? String(settings.maxTradesPerDay) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Instruments without a rule yet, offered as one-click additions.
  const suggestions = useMemo(() => {
    const have = new Set(rules.map((r) => instrumentKey(r.instrument)))
    const all = [...new Set([...INSTRUMENT_PRESETS.map((p) => p.name), ...knownInstruments])]
    return all.filter((n) => !have.has(instrumentKey(n)))
  }, [rules, knownInstruments])

  // A new rule starts from the default rate — or 30 if the default is 0, since a 0% rule would do nothing.
  const addRule = (instrument = '') => setRules((prev) => [...prev, { instrument, rate: Number(rate) > 0 ? rate : '30', mode }])
  const updateRule = (i: number, patch: Partial<RuleRow>) => setRules((prev) => prev.map((r, at) => (at === i ? { ...r, ...patch } : r)))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const taxRate = Number(rate)
    if (!(taxRate >= 0 && taxRate <= 100)) return setError('The default tax rate must be between 0 and 100.')

    const taxRules: TaxRule[] = []
    const seen = new Set<string>()
    for (const r of rules) {
      const name = r.instrument.trim()
      if (!name) continue // a blank row is just ignored
      const n = Number(r.rate)
      if (r.rate.trim() === '' || !(n >= 0 && n <= 100)) return setError(`Enter a tax rate between 0 and 100 for ${name}.`)
      if (seen.has(instrumentKey(name))) return setError(`${name} has more than one tax rule.`)
      seen.add(instrumentKey(name))
      taxRules.push({ instrument: name, rate: n, mode: r.mode })
    }

    setSaving(true)
    setError(null)
    try {
      await onSave({
        taxRate,
        taxMode: mode,
        taxRules,
        startingCapital: Math.max(0, Number(capital) || 0),
        dailyLossLimit: Math.max(0, Number(lossLimit) || 0),
        maxTradesPerDay: Math.max(0, Math.round(Number(maxTrades) || 0)),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the settings.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div>
            <p className={groupTitle}>Default tax</p>
            <p className="mb-2 text-xs text-text-secondary">Applied to any instrument without its own rule below. Leave it at 0 for instruments whose tax is already accounted for elsewhere (like Options Analytics).</p>
            <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <Field label="Rate (%)">
                <input type="number" step="0.01" aria-label="Default tax rate" className={inputClass} value={rate} onChange={(e) => setRate(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How tax is calculated by default">
                {TAX_MODES.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === o.id}
                    data-cursor="hover"
                    onClick={() => setMode(o.id)}
                    title={o.text}
                    className={cn('rounded-xl border px-3 py-2 text-left transition-colors', mode === o.id ? 'border-accent/60 bg-accent/10' : 'border-border bg-surface-2 hover:border-accent/40')}
                  >
                    <span className={cn('block text-xs font-medium', mode === o.id ? 'text-accent' : 'text-text')}>{o.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-text-secondary">{o.text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className={groupTitle}>Different rate for an instrument</p>
            <p className="mb-2 text-xs text-text-secondary">Options, Bitcoin and gold are often taxed differently. Only the instruments listed here are taxed (Bitcoin at 30% to begin with).</p>

            {rules.length > 0 && (
              <ul className="mb-2 space-y-2">
                {rules.map((r, i) => (
                  <li key={i} className="grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,1.1fr)_auto] items-center gap-2">
                    <input
                      list="tax-rule-instruments"
                      aria-label={`Instrument ${i + 1}`}
                      className={inputClass}
                      value={r.instrument}
                      placeholder="Instrument"
                      onChange={(e) => updateRule(i, { instrument: e.target.value })}
                    />
                    <div className="relative">
                      <input type="number" step="0.01" aria-label={`Tax rate for ${r.instrument || `instrument ${i + 1}`}`} className={cn(inputClass, 'pr-6')} value={r.rate} onChange={(e) => updateRule(i, { rate: e.target.value })} />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-secondary">%</span>
                    </div>
                    <select aria-label={`Method for ${r.instrument || `instrument ${i + 1}`}`} className={inputClass} value={r.mode} onChange={(e) => updateRule(i, { mode: e.target.value as TaxMode })}>
                      <option value="per-trade" className="bg-card">
                        Each winning trade
                      </option>
                      <option value="net" className="bg-card">
                        Net profit
                      </option>
                    </select>
                    <button type="button" data-cursor="hover" aria-label={`Remove rule ${i + 1}`} onClick={() => setRules((prev) => prev.filter((_, at) => at !== i))} className="rounded-md p-1.5 text-text-secondary hover:bg-error/10 hover:text-error">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <datalist id="tax-rule-instruments">
              {suggestions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>

            <div className="flex flex-wrap items-center gap-1.5">
              {suggestions.slice(0, 6).map((n) => (
                <button
                  key={n}
                  type="button"
                  data-cursor="hover"
                  onClick={() => addRule(n)}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
                >
                  <Plus className="h-3 w-3" />
                  {n}
                </button>
              ))}
              <button type="button" data-cursor="hover" onClick={() => addRule()} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text">
                <Plus className="h-3 w-3" />
                Other instrument
              </button>
            </div>
          </div>
        </div>

        <div>
          <p className={groupTitle}>Capital & risk rules</p>
          <div className="space-y-3">
            <Field label="Starting capital (₹)" hint="for return % & drawdown %">
              <input type="number" className={inputClass} value={capital} placeholder="0 = off" onChange={(e) => setCapital(e.target.value)} />
            </Field>
            <Field label="Daily loss limit (₹)" hint="flags breach days">
              <input type="number" className={inputClass} value={lossLimit} placeholder="0 = off" onChange={(e) => setLossLimit(e.target.value)} />
            </Field>
            <Field label="Max trades a day" hint="flags overtrading">
              <input type="number" className={inputClass} value={maxTrades} placeholder="0 = off" onChange={(e) => setMaxTrades(e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-error">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" magnetic={false} onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" magnetic={false} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save settings
        </Button>
      </div>
    </form>
  )
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  knownInstruments,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: JournalSettings
  knownInstruments: string[]
  onSave: (s: JournalSettings) => Promise<void>
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-native-cursor className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          data-native-cursor
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[151] max-h-[92vh] w-[94vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl lg:max-w-4xl"
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="font-display text-lg font-semibold text-text">Journal settings</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-text-secondary hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          {open && <SettingsForm settings={settings} knownInstruments={knownInstruments} onSave={onSave} onClose={() => onOpenChange(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
