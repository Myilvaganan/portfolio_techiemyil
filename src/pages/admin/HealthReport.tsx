import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageBadge } from '@/components/admin/AdminShell'
import { MotionConfig, motion } from 'framer-motion'
import { AlertTriangle, Camera, HeartPulse, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Card, Chips, Kpi } from '@/components/statements/parts'
import { BodyMap, RangeBar } from '@/components/health/parts'
import { ReportCalendar } from '@/components/health/ReportCalendar'
import { ReportDialog } from '@/components/health/ReportDialog'
import { GoalCard } from '@/components/health/GoalCard'
import { DailyLogCard } from '@/components/health/DailyLogCard'
import { AreaChart, Legend, vizColor } from '@/components/viz/charts'
import { Reveal, ScrollProgress } from '@/components/viz/motion'
import { Pagination } from '@/components/viz/Pagination'
import { cn } from '@/lib/utils'
import { dayLabel } from '@/lib/statements'
import {
  blankReport,
  changeOf,
  dailyDeficit,
  findings,
  fmtDelta,
  fmtMetric,
  healthReminder,
  historyReports,
  rangeOf,
  reportDate,
  sortReports,
  statusOf,
  upIsGood,
  type DailyLog,
  type Goal,
  type HealthReport as Report,
  type HistoryPoint,
  type MetricKey,
} from '@/lib/health'
import { deleteLog, deleteReport, fetchGoal, fetchLogs, fetchReports, saveGoal as apiSaveGoal, saveLog as apiSaveLog, saveReports, scanReport } from '@/lib/healthApi'

const MUSCLE_FAT: MetricKey[] = ['weight', 'skeletalMuscleMass', 'bodyFatMass']
const OBESITY: MetricKey[] = ['bmi', 'percentBodyFat', 'waistHipRatio', 'visceralFatLevel']
const COMPOSITION: MetricKey[] = ['totalBodyWater', 'protein', 'minerals', 'fatFreeMass', 'basalMetabolicRate', 'obesityDegree']
const TREND: { key: MetricKey; label: string }[] = [
  { key: 'weight', label: 'Weight' },
  { key: 'skeletalMuscleMass', label: 'Muscle (SMM)' },
  { key: 'bodyFatMass', label: 'Body fat mass' },
]
const PLAN_WEEKS = 26
const CONTROL: { key: MetricKey; label: string }[] = [
  { key: 'targetWeight', label: 'Target weight' },
  { key: 'weightControl', label: 'Weight change' },
  { key: 'fatControl', label: 'Fat change' },
  { key: 'muscleControl', label: 'Muscle change' },
  { key: 'recommendedCalories', label: 'Daily intake' },
  { key: 'smi', label: 'SMI' },
]
const PAGE_SIZE = 6

const tone = (r: Report, key: MetricKey) => {
  const s = statusOf(r.values[key], rangeOf(r, key))
  return s === 'normal' ? 'good' : s === 'over' ? 'bad' : s === 'under' ? 'warn' : undefined
}

function ChangeNote({ reports, metric }: { reports: Report[]; metric: MetricKey }) {
  const c = changeOf(reports, metric)
  if (!c) return null
  const good = upIsGood(metric)
  const cls = good === null || c.delta === 0 ? 'text-text-secondary' : c.delta > 0 === good ? 'text-positive' : 'text-error'
  return (
    <>
      <span className={cn('font-medium', cls)}>{fmtDelta(metric, c.delta)}</span> since {dayLabel(c.since)}
    </>
  )
}

const FINDING_TONE = {
  good: 'border-positive/35 bg-positive/[0.08]',
  warn: 'border-amber-500/40 bg-amber-500/[0.08]',
  bad: 'border-error/40 bg-error/[0.08]',
} as const

interface Batch {
  files: File[]
  index: number
  skipped: number
}

export function HealthReport() {
  const [reports, setReports] = useState<Report[]>([])
  const [goal, setGoal] = useState<Goal | null>(null)
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [loading, setLoading] = useState(true)
  const [reportsLoaded, setReportsLoaded] = useState(false)
  const [goalLoaded, setGoalLoaded] = useState(false)
  const [logsLoaded, setLogsLoaded] = useState(false)
  const request = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState('')
  const [editing, setEditing] = useState<Report | null>(null)
  const [scanHistory, setScanHistory] = useState<HistoryPoint[]>([])
  const [scanning, setScanning] = useState(false)
  const [batch, setBatch] = useState<Batch | null>(null)
  const [side, setSide] = useState<'lean' | 'fat'>('fat')
  const [page, setPage] = useState(1)
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    const id = ++request.current
    setLoading(true)
    const [r, g, l] = await Promise.allSettled([fetchReports(), fetchGoal(), fetchLogs()])
    if (id !== request.current) return
    if (r.status === 'fulfilled') { setReports(r.value); setReportsLoaded(true) }
    if (g.status === 'fulfilled') { setGoal(g.value); setGoalLoaded(true) }
    if (l.status === 'fulfilled') { setLogs(l.value); setLogsLoaded(true) }
    const errors = [r, g, l].flatMap((result) => result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : 'Could not load health data.'] : [])
    setError(errors.join(' · ') || null)
    setLoading(false)
  }, [])

  useEffect(() => {
    const counter = request
    void reload()
    return () => { counter.current++ }
  }, [reload])

  const sorted = useMemo(() => sortReports(reports), [reports])
  // Full reports only: an entry copied from a sheet's history table has just three numbers.
  const full = useMemo(() => sorted.filter((r) => r.source !== 'history'), [sorted])
  const latest = full[full.length - 1] ?? sorted[sorted.length - 1]
  const report = sorted.find((r) => r.id === selected) ?? latest
  const upTo = useMemo(() => (report ? sorted.filter((r) => r.testedAt <= report.testedAt) : []), [sorted, report])
  const notes = useMemo(() => (report ? findings(report) : []), [report])
  const profile = latest?.profile
  const reminder = useMemo(() => healthReminder(full), [full])

  const trend = useMemo(() => {
    const points = sorted.filter((r) => TREND.some((t) => r.values[t.key] !== null))
    return {
      labels: points.map((r) => dayLabel(reportDate(r))),
      series: TREND.filter((t) => points.every((r) => r.values[t.key] !== null)).map((t, i) => ({
        key: t.key,
        label: t.label,
        color: vizColor(i),
        values: points.map((r) => r.values[t.key] as number),
      })),
    }
  }, [sorted])

  function openNew() {
    setScanHistory([])
    setEditing(blankReport(profile))
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return
    setScanning(true)
    setError(null)
    try {
      const { report: scanned, history } = await scanReport(file)
      setScanHistory(history)
      setEditing(scanned)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Scans one sheet of a multi-photo batch, skipping a date already stored, then pauses on the dialog for the user
  // to confirm before moving to the next photo (the dialog's close handler advances the batch).
  async function processBatchAt(files: File[], index: number, skipped: number) {
    if (index >= files.length) {
      setBatch(null)
      return
    }
    setScanning(true)
    setError(null)
    try {
      const { report: scanned, history } = await scanReport(files[index])
      if (reports.some((r) => reportDate(r) === reportDate(scanned))) {
        setBatch({ files, index: index + 1, skipped: skipped + 1 })
        setScanning(false)
        await processBatchAt(files, index + 1, skipped + 1)
        return
      }
      setBatch({ files, index, skipped })
      setScanHistory(history)
      setEditing(scanned)
    } catch (e) {
      setError((e as Error).message)
      setBatch({ files, index: index + 1, skipped })
      setScanning(false)
      await processBatchAt(files, index + 1, skipped)
      return
    }
    setScanning(false)
  }

  async function onPhotos(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : []
    if (fileRef.current) fileRef.current.value = ''
    if (files.length === 0) return
    if (files.length === 1) {
      await onPhoto(files[0])
      return
    }
    setScanHistory([])
    setBatch({ files, index: 0, skipped: 0 })
    await processBatchAt(files, 0, 0)
  }

  function onDialogOpenChange(open: boolean) {
    if (open) return
    setEditing(null)
    if (!batch) return
    const nextIndex = batch.index + 1
    if (nextIndex >= batch.files.length) setBatch(null)
    else void processBatchAt(batch.files, nextIndex, batch.skipped)
  }

  async function onSave(r: Report, includeHistory: boolean) {
    const extra = includeHistory ? historyReports(scanHistory, reports, r) : []
    const next = await saveReports([r, ...extra])
    setReports(next)
    // Show what was just saved: the newest report with this test date.
    const saved = sortReports(next).filter((x) => x.testedAt === r.testedAt).pop()
    if (saved) setSelected(saved.id)
  }

  async function onSaveGoal(g: Partial<Goal>) {
    setGoal(await apiSaveGoal(g))
  }

  async function onSaveLog(log: DailyLog) {
    setLogs(await apiSaveLog(log))
  }

  async function onDeleteLog(date: string) {
    setLogs(await deleteLog(date))
  }

  async function onDelete(r: Report) {
    if (!window.confirm(`Delete the report from ${dayLabel(reportDate(r))}?`)) return
    try {
      setReports(await deleteReport(r.id))
      if (selected === r.id) setSelected('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const listed = [...sorted].reverse()
  const pages = Math.max(1, Math.ceil(listed.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const v = report?.values
  const fatToLose = v?.fatControl !== null && v?.fatControl !== undefined && v.fatControl < 0 ? Math.abs(v.fatControl) : 0

  return (
    <MotionConfig reducedMotion="user">
      <ScrollProgress />
      <div className="w-full space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <PageBadge />
            <div className="min-w-0">
            <p className="page-eyebrow">InBody</p>
            <h1 className="mt-1 page-title">Health Report</h1>
            <p className="page-lede">Snap your body-composition sheet. The numbers are read for you, and you can see where each one sits against its normal range and how it changes over time.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" aria-label="Report photo" onChange={(e) => void onPhotos(e.target.files)} />
            <button
              type="button"
              data-cursor="hover"
              disabled={scanning || batch !== null}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}{' '}
              {batch ? `Reading sheet ${Math.min(batch.index + 1, batch.files.length)} of ${batch.files.length}…` : scanning ? 'Reading photo…' : 'Scan report photo(s)'}
            </button>
            <button type="button" data-cursor="hover" onClick={openNew} className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-text-secondary transition-colors hover:border-accent/40 hover:text-text">
              <Plus className="h-3.5 w-3.5" /> Enter manually
            </button>
            <button type="button" data-cursor="hover" onClick={() => void reload()} aria-label="Refresh" className="rounded-full border border-border p-2 text-text-secondary transition-colors hover:border-accent/40 hover:text-text">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {batch && (
          <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-text">
            Sheet {Math.min(batch.index + 1, batch.files.length)} of {batch.files.length}
            {batch.skipped > 0 && ` · ${batch.skipped} skipped (already have that date, or unreadable)`}
          </p>
        )}

        {!loading && reportsLoaded && reminder.due && (
          <p className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-text">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            {reminder.daysSince === null ? "You haven't logged a test yet." : `Your last test was ${reminder.daysSince} days ago.`}
            <button type="button" data-cursor="hover" onClick={() => fileRef.current?.click()} className="font-medium text-accent hover:underline">
              Add test
            </button>
          </p>
        )}

        {error && <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}

        {!loading && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Goal">
              {goalLoaded ? <GoalCard reports={full} goal={goal} onSave={onSaveGoal} /> : <p className="text-sm text-error">Goal could not be loaded. Refresh to retry.</p>}
            </Card>
            <Card title="Daily log">
              {logsLoaded ? <DailyLogCard logs={logs} onSave={onSaveLog} onDelete={onDeleteLog} /> : <p className="text-sm text-error">Daily logs could not be loaded. Refresh to retry.</p>}
            </Card>
          </div>
        )}

        {loading ? (
          <GlassCard hover={false} className="flex items-center justify-center gap-3 py-24 text-sm text-text-secondary">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading your reports…
          </GlassCard>
        ) : !reportsLoaded ? <p className="text-sm text-error">Reports could not be loaded. Refresh to retry.</p> : !report ? (
          <Reveal>
            <GlassCard hover={false} className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <motion.span animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 3 }} className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <HeartPulse className="h-7 w-7" />
              </motion.span>
              <h2 className="section-title">Add your first body-composition report</h2>
              <p className="max-w-md text-sm text-text-secondary">
                Take a straight-on photo of your InBody result sheet and choose <strong className="text-text">Scan report photo</strong>. You check the numbers before anything is saved. The photo itself isn&apos;t kept.
              </p>
            </GlassCard>
          </Reveal>
        ) : (
          <>
            {full.length > 1 && (
              <Chips label="Report" value={report.id} onChange={setSelected} options={[...full].reverse().map((r) => ({ id: r.id, label: dayLabel(reportDate(r)) }))} />
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
              <span>
                Tested <span className="text-text">{dayLabel(reportDate(report))}</span>
                {report.testedAt.length > 10 && ` at ${report.testedAt.slice(11)}`}
              </span>
              {report.device && <span>{report.device}</span>}
              {report.profile.heightCm && <span>{report.profile.heightCm} cm</span>}
              {report.profile.age && <span>{report.profile.age} yrs</span>}
              {report.profile.sex && <span className="capitalize">{report.profile.sex}</span>}
              <button type="button" data-cursor="hover" onClick={() => { setScanHistory([]); setEditing(report) }} className="inline-flex items-center gap-1 text-accent hover:underline">
                <Pencil className="h-3 w-3" /> Edit
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Weight" value={v!.weight ?? 0} format={(n) => fmtMetric('weight', v!.weight === null ? null : n)} tone={tone(report, 'weight')} sub={<ChangeNote reports={upTo} metric="weight" />} />
              <Kpi label="Muscle (SMM)" value={v!.skeletalMuscleMass ?? 0} format={(n) => fmtMetric('skeletalMuscleMass', v!.skeletalMuscleMass === null ? null : n)} tone={tone(report, 'skeletalMuscleMass')} sub={<ChangeNote reports={upTo} metric="skeletalMuscleMass" />} delay={0.05} />
              <Kpi label="Body fat" value={v!.percentBodyFat ?? 0} format={(n) => fmtMetric('percentBodyFat', v!.percentBodyFat === null ? null : n)} tone={tone(report, 'percentBodyFat')} sub={<ChangeNote reports={upTo} metric="percentBodyFat" />} delay={0.1} />
              <Kpi label="Visceral fat" value={v!.visceralFatLevel ?? 0} format={(n) => (v!.visceralFatLevel === null ? '—' : `Level ${Math.round(n)}`)} tone={tone(report, 'visceralFatLevel')} sub={<ChangeNote reports={upTo} metric="visceralFatLevel" />} delay={0.15} />
              <Kpi label="InBody score" value={v!.inbodyScore ?? 0} format={(n) => fmtMetric('inbodyScore', v!.inbodyScore === null ? null : n)} tone={v!.inbodyScore === null ? undefined : v!.inbodyScore >= 80 ? 'good' : v!.inbodyScore >= 70 ? 'warn' : 'bad'} sub={<ChangeNote reports={upTo} metric="inbodyScore" />} delay={0.2} />
              <Kpi label="BMR" value={v!.basalMetabolicRate ?? 0} format={(n) => fmtMetric('basalMetabolicRate', v!.basalMetabolicRate === null ? null : n)} sub="calories burned at rest" delay={0.25} />
            </div>

            {notes.length > 0 && (
              <Card title="What this report says">
                <ul className="grid gap-3 md:grid-cols-2">
                  {notes.map((n) => (
                    <li key={n.title} className={cn('rounded-xl border px-4 py-3', FINDING_TONE[n.tone])}>
                      <p className="text-sm font-medium text-text">{n.title}</p>
                      <p className="mt-0.5 text-xs text-text-secondary">{n.detail}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-2xs text-text-secondary">Based on the ranges printed on your sheet. This is a summary, not medical advice.</p>
              </Card>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Muscle-fat analysis">
                {MUSCLE_FAT.map((k) => <RangeBar key={k} metric={k} value={v![k]} range={rangeOf(report, k)} />)}
              </Card>
              <Card title="Obesity analysis">
                {OBESITY.map((k) => <RangeBar key={k} metric={k} value={v![k]} range={rangeOf(report, k)} />)}
              </Card>
            </div>

            <Card title="Body composition">
              <div className="grid gap-x-8 md:grid-cols-2">
                {COMPOSITION.map((k) => <RangeBar key={k} metric={k} value={v![k]} range={rangeOf(report, k)} />)}
              </div>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Segmental analysis" aside={<Chips label="Segment view" value={side} onChange={setSide} options={[{ id: 'fat', label: 'Fat' }, { id: 'lean', label: 'Lean' }]} />}>
                <BodyMap report={report} side={side} />
                <p className="mt-3 text-center text-2xs text-text-secondary">Left and right as printed on the sheet.</p>
              </Card>

              <Card title="Weight control">
                <dl className="grid grid-cols-2 gap-3">
                  {CONTROL.map(({ key, label }) => (
                    <div key={key} className="rounded-xl border border-border bg-surface-2 px-3 py-2.5">
                      <dt className="label-caps">{label}</dt>
                      <dd className="mt-0.5 font-mono text-sm font-semibold text-text">{fmtMetric(key, v![key])}</dd>
                    </div>
                  ))}
                </dl>
                {fatToLose > 0 && (
                  <p className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.06] px-3 py-2.5 text-xs text-text-secondary">
                    Losing <span className="font-medium text-text">{fmtMetric('fatControl', fatToLose)}</span> of fat over {PLAN_WEEKS} weeks (about 6 months) takes a deficit of about{' '}
                    <span className="font-medium text-text">{dailyDeficit(fatToLose, PLAN_WEEKS).toLocaleString('en-IN')} kcal a day</span>
                    {v!.recommendedCalories !== null && <> — for example eating near the sheet&apos;s {fmtMetric('recommendedCalories', v!.recommendedCalories)} and adding activity</>}.
                  </p>
                )}
              </Card>
            </div>

            {trend.labels.length > 1 && trend.series.length > 0 && (
              <Card title="Trend" aside={<Legend items={trend.series.map((s) => ({ label: s.label, color: s.color }))} />}>
                <AreaChart labels={trend.labels} series={trend.series} format={(n) => `${n.toFixed(1)} kg`} axisFormat={(n) => n.toFixed(0)} />
              </Card>
            )}

            <Card title="Calendar">
              <ReportCalendar reports={sorted} selectedId={report.id} onSelect={setSelected} />
            </Card>

            <Card title={`All reports (${listed.length})`}>
              <ul className="divide-y divide-border/60">
                {listed.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                    <button type="button" data-cursor="hover" disabled={r.source === 'history'} onClick={() => setSelected(r.id)} className="min-w-0 text-left disabled:cursor-default">
                      <span className={cn('block font-medium', r.id === report.id ? 'text-accent' : 'text-text')}>
                        {dayLabel(reportDate(r))}
                        {r.source === 'history' && <span className="ml-2 font-normal text-text-secondary">from a sheet&apos;s history table</span>}
                      </span>
                      <span className="text-text-secondary">
                        {fmtMetric('weight', r.values.weight)} · SMM {fmtMetric('skeletalMuscleMass', r.values.skeletalMuscleMass)} · body fat {fmtMetric('percentBodyFat', r.values.percentBodyFat)}
                        {r.notes && ` · ${r.notes}`}
                      </span>
                    </button>
                    <span className="flex items-center gap-2">
                      <button type="button" data-cursor="hover" aria-label={`Edit report from ${reportDate(r)}`} onClick={() => { setScanHistory([]); setEditing(r) }} className="rounded-full border border-border p-1.5 text-text-secondary transition-colors hover:border-accent/40 hover:text-text">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" data-cursor="hover" aria-label={`Delete report from ${reportDate(r)}`} onClick={() => void onDelete(r)} className="rounded-full border border-border p-1.5 text-text-secondary transition-colors hover:border-error/40 hover:text-error">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              {listed.length > PAGE_SIZE && <Pagination page={current} pageSize={PAGE_SIZE} total={listed.length} onPage={setPage} />}
            </Card>
          </>
        )}
      </div>

      <ReportDialog open={editing !== null} onOpenChange={onDialogOpenChange} report={editing} history={editing?.id ? [] : scanHistory} onSave={onSave} />
    </MotionConfig>
  )
}
