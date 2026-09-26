import { useMemo, useState, type FormEvent } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { inputClass } from '@/components/journal/parts'
import { AreaChart } from '@/components/viz/charts'
import { todayStr } from '@/lib/journal'
import { dayLabel } from '@/lib/statements'
import { cn } from '@/lib/utils'
import { blankLog, logAverages, sortLogs, type DailyLog } from '@/lib/health'

function fmt1(n: number | null, unit = '') {
  return n === null ? '—' : `${n.toFixed(1)}${unit}`
}

function Avg({ label, value, unit = '' }: { label: string; value: number | null; unit?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold text-text">{fmt1(value, unit)}</p>
    </div>
  )
}

export function DailyLogCard({ logs, onSave, onDelete }: { logs: DailyLog[]; onSave: (log: DailyLog) => Promise<void>; onDelete: (date: string) => Promise<void> }) {
  const [f, setF] = useState(() => blankLog(todayStr()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sorted = useMemo(() => sortLogs(logs), [logs])
  const weighed = useMemo(() => sorted.filter((l) => l.weight !== null), [sorted])
  const avg7 = useMemo(() => logAverages(logs, 7), [logs])
  const avg30 = useMemo(() => logAverages(logs, 30), [logs])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.date) return setError('Pick a date.')
    if (f.weight === null && f.steps === null && f.waterL === null && f.sleepH === null && !f.note.trim()) return setError('Enter at least one value.')
    setBusy(true)
    setError(null)
    try {
      await onSave(f)
      setF(blankLog(todayStr()))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const num = (s: string) => (s.trim() === '' ? null : Number.isFinite(Number(s)) ? Number(s) : null)

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <input aria-label="Log date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={inputClass} />
        <input aria-label="Log weight" inputMode="decimal" placeholder="Weight kg" value={f.weight ?? ''} onChange={(e) => setF({ ...f, weight: num(e.target.value) })} className={inputClass} />
        <input aria-label="Log steps" inputMode="numeric" placeholder="Steps" value={f.steps ?? ''} onChange={(e) => setF({ ...f, steps: num(e.target.value) })} className={inputClass} />
        <input aria-label="Log water" inputMode="decimal" placeholder="Water L" value={f.waterL ?? ''} onChange={(e) => setF({ ...f, waterL: num(e.target.value) })} className={inputClass} />
        <input aria-label="Log sleep" inputMode="decimal" placeholder="Sleep h" value={f.sleepH ?? ''} onChange={(e) => setF({ ...f, sleepH: num(e.target.value) })} className={inputClass} />
        <button type="submit" data-cursor="hover" disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-60">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
        </button>
      </form>
      {error && <p role="alert" className="text-xs text-error">{error}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Avg label="7d avg weight" value={avg7.weight} unit=" kg" />
        <Avg label="30d avg weight" value={avg30.weight} unit=" kg" />
        <Avg label="7d avg steps" value={avg7.steps} />
        <Avg label="30d avg steps" value={avg30.steps} />
      </div>

      {weighed.length > 1 ? (
        <AreaChart
          labels={weighed.map((l) => dayLabel(l.date))}
          series={[{ key: 'weight', label: 'Logged weight', color: 'var(--viz-2)', values: weighed.map((l) => l.weight as number) }]}
          format={(n) => `${n.toFixed(1)} kg`}
          axisFormat={(n) => n.toFixed(0)}
          height={160}
        />
      ) : (
        <p className="py-4 text-center text-xs text-text-secondary">Log your weight on a few days to see the daily trend here.</p>
      )}

      {sorted.length > 0 && (
        <ul className="max-h-48 divide-y divide-border/60 overflow-y-auto text-xs">
          {[...sorted].reverse().map((l) => (
            <li key={l.date} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-text-secondary">
                <span className="font-medium text-text">{dayLabel(l.date)}</span>
                {l.weight !== null && ` · ${l.weight.toFixed(1)} kg`}
                {l.steps !== null && ` · ${l.steps.toLocaleString('en-IN')} steps`}
                {l.waterL !== null && ` · ${l.waterL.toFixed(1)} L`}
                {l.sleepH !== null && ` · ${l.sleepH.toFixed(1)} h sleep`}
                {l.note && ` · ${l.note}`}
              </span>
              <button type="button" data-cursor="hover" aria-label={`Delete log for ${l.date}`} onClick={() => void onDelete(l.date)} className={cn('rounded-full border border-border p-1 text-text-secondary transition-colors hover:border-error/40 hover:text-error')}>
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
