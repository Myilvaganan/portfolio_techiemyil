import { useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, inputClass, labelClass } from '@/components/journal/parts'
import { cn } from '@/lib/utils'
import {
  METRICS,
  SEGMENTS,
  defaultRange,
  type HealthReport,
  type HistoryPoint,
  type MetricKey,
  type SegmentEval,
  type SegmentKey,
  type Sex,
} from '@/lib/health'

type SegForm = Record<SegmentKey, { kg: string; eval: SegmentEval }>

interface FormState {
  testedAt: string
  device: string
  heightCm: string
  age: string
  sex: Sex
  values: Record<MetricKey, string>
  ranges: Record<MetricKey, { low: string; high: string }>
  lean: SegForm
  fat: SegForm
  notes: string
}

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))
const num = (s: string) => {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function toForm(r: HealthReport): FormState {
  const segs = (side: 'lean' | 'fat') =>
    Object.fromEntries(SEGMENTS.map((s) => [s.key, { kg: str(r.segments[side][s.key].kg), eval: r.segments[side][s.key].eval }])) as SegForm
  return {
    testedAt: r.testedAt.length === 10 ? `${r.testedAt}T00:00` : r.testedAt,
    device: r.device,
    heightCm: str(r.profile.heightCm),
    age: str(r.profile.age),
    sex: r.profile.sex,
    values: Object.fromEntries(METRICS.map((m) => [m.key, str(r.values[m.key])])) as FormState['values'],
    ranges: Object.fromEntries(METRICS.map((m) => [m.key, { low: str(r.ranges[m.key]?.low), high: str(r.ranges[m.key]?.high) }])) as FormState['ranges'],
    lean: segs('lean'),
    fat: segs('fat'),
    notes: r.notes,
  }
}

function fromForm(f: FormState, base: HealthReport): HealthReport {
  const ranges: HealthReport['ranges'] = {}
  for (const m of METRICS) {
    const low = num(f.ranges[m.key].low)
    const high = num(f.ranges[m.key].high)
    if (low !== null && high !== null && low <= high) ranges[m.key] = { low, high }
  }
  const segs = (s: SegForm) =>
    Object.fromEntries(SEGMENTS.map(({ key }) => [key, { kg: num(s[key].kg), eval: s[key].eval }])) as HealthReport['segments']['lean']
  return {
    ...base,
    // Midnight means no time was known; keep the date alone.
    testedAt: f.testedAt.endsWith('T00:00') ? f.testedAt.slice(0, 10) : f.testedAt,
    device: f.device.trim(),
    profile: { heightCm: num(f.heightCm), age: num(f.age), sex: f.sex },
    values: Object.fromEntries(METRICS.map((m) => [m.key, num(f.values[m.key])])) as HealthReport['values'],
    ranges,
    segments: { lean: segs(f.lean), fat: segs(f.fat) },
    notes: f.notes.trim(),
  }
}

function SegmentTable({ title, value, onChange }: { title: string; value: SegForm; onChange: (v: SegForm) => void }) {
  return (
    <div>
      <p className={cn(labelClass, 'mb-2')}>{title}</p>
      <div className="space-y-1.5">
        {SEGMENTS.map((s) => (
          <div key={s.key} className="grid grid-cols-[5.5rem_1fr_6rem] items-center gap-2">
            <span className="text-xs text-text-secondary">{s.label}</span>
            <input
              aria-label={`${title} ${s.label} kg`}
              inputMode="decimal"
              placeholder="kg"
              value={value[s.key].kg}
              onChange={(e) => onChange({ ...value, [s.key]: { ...value[s.key], kg: e.target.value } })}
              className={inputClass}
            />
            <select
              aria-label={`${title} ${s.label} evaluation`}
              value={value[s.key].eval}
              onChange={(e) => onChange({ ...value, [s.key]: { ...value[s.key], eval: e.target.value as SegmentEval } })}
              className={inputClass}
            >
              <option value="">—</option>
              <option>Under</option>
              <option>Normal</option>
              <option>Over</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportForm({
  initial,
  history,
  onSave,
  onClose,
}: {
  initial: HealthReport
  history: HistoryPoint[]
  onSave: (report: HealthReport, includeHistory: boolean) => Promise<void>
  onClose: () => void
}) {
  const [f, setF] = useState(() => toForm(initial))
  const [includeHistory, setIncludeHistory] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((prev) => ({ ...prev, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const report = fromForm(f, initial)
    if (!report.testedAt) return setError('Pick the test date.')
    if (!METRICS.some((m) => report.values[m.key] !== null)) return setError('Enter at least one measurement.')
    setBusy(true)
    setError(null)
    try {
      await onSave(report, includeHistory && history.length > 0)
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {initial.source === 'scan' && !initial.id && (
        <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-text">
          Read from your photo — check the numbers against the sheet before saving.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="Tested" className="col-span-2">
          <input type="datetime-local" required value={f.testedAt} onChange={(e) => set('testedAt', e.target.value)} className={inputClass} />
        </Field>
        <Field label="Height" hint="cm">
          <input inputMode="decimal" value={f.heightCm} onChange={(e) => set('heightCm', e.target.value)} className={inputClass} />
        </Field>
        <Field label="Age">
          <input inputMode="numeric" value={f.age} onChange={(e) => set('age', e.target.value)} className={inputClass} />
        </Field>
        <Field label="Sex">
          <select value={f.sex} onChange={(e) => set('sex', e.target.value as Sex)} className={inputClass}>
            <option value="">—</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </Field>
        <Field label="Device" className="col-span-2 sm:col-span-5">
          <input value={f.device} placeholder="e.g. InBody260" onChange={(e) => set('device', e.target.value)} className={inputClass} />
        </Field>
      </div>

      <div>
        <p className={cn(labelClass, 'mb-2')}>Measurements <span className="normal-case tracking-normal text-text-secondary/60">· normal range as printed on the sheet</span></p>
        <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          {METRICS.map((m) => {
            const fallback = defaultRange(m.key, f.sex)
            return (
              <div key={m.key} className="grid grid-cols-[1fr_5.5rem_4.5rem_4.5rem] items-center gap-2">
                <span className="truncate text-xs text-text-secondary" title={m.label}>
                  {m.label}
                  {m.unit && <span className="text-text-secondary/60"> · {m.unit}</span>}
                </span>
                <input
                  aria-label={m.label}
                  inputMode="decimal"
                  value={f.values[m.key]}
                  onChange={(e) => set('values', { ...f.values, [m.key]: e.target.value })}
                  className={inputClass}
                />
                {m.ranged ? (
                  <>
                    <input
                      aria-label={`${m.label} normal low`}
                      inputMode="decimal"
                      placeholder={fallback ? String(fallback.low) : 'low'}
                      value={f.ranges[m.key].low}
                      onChange={(e) => set('ranges', { ...f.ranges, [m.key]: { ...f.ranges[m.key], low: e.target.value } })}
                      className={cn(inputClass, 'text-xs')}
                    />
                    <input
                      aria-label={`${m.label} normal high`}
                      inputMode="decimal"
                      placeholder={fallback ? String(fallback.high) : 'high'}
                      value={f.ranges[m.key].high}
                      onChange={(e) => set('ranges', { ...f.ranges, [m.key]: { ...f.ranges[m.key], high: e.target.value } })}
                      className={cn(inputClass, 'text-xs')}
                    />
                  </>
                ) : (
                  <span className="col-span-2" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SegmentTable title="Segmental lean" value={f.lean} onChange={(v) => set('lean', v)} />
        <SegmentTable title="Segmental fat" value={f.fat} onChange={(v) => set('fat', v)} />
      </div>

      <Field label="Notes">
        <textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Diet, training, how you felt…" className={inputClass} />
      </Field>

      {history.length > 0 && (
        <label className="flex items-start gap-2 text-xs text-text-secondary">
          <input type="checkbox" checked={includeHistory} onChange={(e) => setIncludeHistory(e.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" />
          <span>
            Also add {history.length} earlier test{history.length === 1 ? '' : 's'} from the sheet&apos;s history table (
            {history.map((h) => h.date).join(', ')}) — weight, muscle and body fat only. Dates you already have are skipped.
          </span>
        </label>
      )}

      {error && <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" magnetic={false} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" magnetic={false} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {initial.id ? 'Save changes' : 'Save report'}
        </Button>
      </div>
    </form>
  )
}

export function ReportDialog({
  open,
  onOpenChange,
  report,
  history = [],
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The report to edit, or a new one (blank id) to add. */
  report: HealthReport | null
  history?: HistoryPoint[]
  onSave: (report: HealthReport, includeHistory: boolean) => Promise<void>
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-native-cursor className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          data-native-cursor
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[151] max-h-[96vh] w-[94vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl"
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="font-display text-lg font-semibold text-text">{report?.id ? 'Edit report' : 'Add report'}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-text-secondary hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          {/* Mounted only while open, so every open starts from a fresh form. */}
          {report && <ReportForm initial={report} history={history} onSave={onSave} onClose={() => onOpenChange(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
