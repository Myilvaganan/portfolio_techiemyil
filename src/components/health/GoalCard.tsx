import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Pencil, Target } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, inputClass } from '@/components/journal/parts'
import { dayLabel } from '@/lib/statements'
import { cn } from '@/lib/utils'
import { fmtMetric, goalProgress, projectGoalDate, type Goal, type HealthReport } from '@/lib/health'

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))
const num = (s: string) => {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function GoalForm({ initial, onSave, onCancel }: { initial: Goal | null; onSave: (goal: Partial<Goal>) => Promise<void>; onCancel: () => void }) {
  const [weightKg, setWeightKg] = useState(str(initial?.weightKg))
  const [bodyFatPct, setBodyFatPct] = useState(str(initial?.bodyFatPct))
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const weight = num(weightKg)
    const bodyFat = num(bodyFatPct)
    if (weight === null && bodyFat === null) return setError('Set a target weight and/or body fat %.')
    setBusy(true)
    setError(null)
    try {
      await onSave({ weightKg: weight, bodyFatPct: bodyFat, targetDate: targetDate || null, notes: initial?.notes ?? '' })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Target weight" hint="kg">
          <input inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Target body fat" hint="%">
          <input inputMode="decimal" value={bodyFatPct} onChange={(e) => setBodyFatPct(e.target.value)} className={inputClass} />
        </Field>
        <Field label="By">
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputClass} />
        </Field>
      </div>
      {error && <p role="alert" className="text-xs text-error">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" magnetic={false} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" magnetic={false} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save goal
        </Button>
      </div>
    </form>
  )
}

function ProgressRow({ label, reports, goal, metric, unit }: { label: string; reports: HealthReport[]; goal: Goal; metric: 'weight' | 'percentBodyFat'; unit: string }) {
  const progress = goalProgress(reports, goal, metric)
  if (!progress) return null
  const target = metric === 'weight' ? goal.weightKg! : goal.bodyFatPct!
  const projection = projectGoalDate(reports, metric, target)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-text">{label}</span>
        <span className="text-text-secondary">
          {progress.current.toFixed(1)}{unit} <span className="text-text-secondary/60">of</span> {progress.target.toFixed(1)}{unit}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-3">
        <motion.div
          className="h-full rounded-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${progress.pct}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </div>
      <p className="text-[11px] text-text-secondary">
        {progress.pct >= 100
          ? 'Target reached.'
          : projection.onTrack && projection.date
            ? `At this trend, projected around ${dayLabel(projection.date)}.`
            : 'Not enough of a trend yet to project a date.'}
        {' '}
        {progress.pct < 100 && `${progress.pct.toFixed(0)}% of the way there.`}
      </p>
    </div>
  )
}

export function GoalCard({ reports, goal, onSave }: { reports: HealthReport[]; goal: Goal | null; onSave: (goal: Partial<Goal>) => Promise<void> }) {
  const [editing, setEditing] = useState(false)

  if (!goal || editing) {
    return (
      <div>
        <GoalForm
          initial={goal}
          onSave={async (g) => {
            await onSave(g)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs text-text-secondary">
          <Target className="h-3.5 w-3.5" />
          {goal.weightKg !== null && <span>{fmtMetric('weight', goal.weightKg)}</span>}
          {goal.bodyFatPct !== null && <span>{goal.weightKg !== null && ' · '}{fmtMetric('percentBodyFat', goal.bodyFatPct)}</span>}
          {goal.targetDate && <span> · by {dayLabel(goal.targetDate)}</span>}
        </p>
        <button type="button" data-cursor="hover" onClick={() => setEditing(true)} className={cn('inline-flex items-center gap-1 text-xs text-accent hover:underline')}>
          <Pencil className="h-3 w-3" /> Edit
        </button>
      </div>
      {goal.weightKg !== null && <ProgressRow label="Weight" reports={reports} goal={goal} metric="weight" unit=" kg" />}
      {goal.bodyFatPct !== null && <ProgressRow label="Body fat" reports={reports} goal={goal} metric="percentBodyFat" unit="%" />}
    </div>
  )
}
