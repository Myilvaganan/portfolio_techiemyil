import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Eye, EyeOff, FileText, KeyRound, Loader2, UploadCloud, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StatementKind } from '@/lib/statements'
import { StatementError, processStatementFile, type Progress } from '@/lib/statementsApi'

type Status = 'queued' | 'working' | 'done' | 'locked' | 'error'

interface Job {
  key: string
  file: File
  status: Status
  stage?: string
  percent: number
  message?: string
  resumeId?: string
  prepared?: { id: string; chunks: number }
  txns?: number
}

const STAGE_LABEL: Record<string, string> = { uploading: 'Uploading securely', unlocking: 'Unlocking PDF', reading: 'AI is reading transactions', saving: 'Saving to your vault' }

function percentOf(p: Progress) {
  if (p.stage === 'uploading') return 10
  if (p.stage === 'unlocking') return 24
  if (p.stage === 'saving') return 96
  return 30 + ((p.done ?? 0) / Math.max(p.total ?? 1, 1)) * 62
}

const ACCEPT = '.pdf,.csv,.txt,application/pdf,text/csv,text/plain'
const CONCURRENCY = 2

export function StatementUploader({ kind, onSaved, onBusyChange, compact }: { kind: StatementKind; onSaved: () => void; onBusyChange?: (busy: boolean) => void; compact?: boolean }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef('')
  passwordRef.current = password

  const patch = useCallback((key: string, next: Partial<Job>) => setJobs((prev) => prev.map((j) => (j.key === key ? { ...j, ...next } : j))), [])

  const run = useCallback(
    async (job: Job) => {
      patch(job.key, { status: 'working', message: undefined })
      try {
        const res = await processStatementFile({
          kind,
          file: job.file,
          password: passwordRef.current,
          resumeId: job.resumeId,
          prepared: job.prepared,
          onProgress: (p) => patch(job.key, { stage: STAGE_LABEL[p.stage], percent: percentOf(p) }),
        })
        patch(job.key, { status: 'done', percent: 100, stage: 'Done', txns: res.statement.txnCount, message: res.replaced ? 'Replaced an earlier upload of the same period' : undefined })
        onSaved()
      } catch (e) {
        const err = e as StatementError
        if (err.code === 'password_required' || err.code === 'wrong_password') {
          patch(job.key, { status: 'locked', resumeId: err.uploadId, message: err.code === 'wrong_password' ? 'That password did not open this PDF.' : 'Password protected — enter the password below.' })
        } else {
          patch(job.key, { status: 'error', resumeId: err.uploadId, prepared: err.prepared, message: err.message })
        }
      }
    },
    [kind, onSaved, patch],
  )

  const runAll = useCallback(
    async (list: Job[]) => {
      let next = 0
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, list.length) }, async () => {
          while (next < list.length) await run(list[next++])
        }),
      )
    },
    [run],
  )

  const addFiles = useCallback(
    (files: File[]) => {
      const accepted = files.filter((f) => /\.(pdf|csv|txt)$/i.test(f.name))
      const rejected = files.length - accepted.length
      const created: Job[] = accepted.map((file) => ({ key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, file, status: 'queued', percent: 0 }))
      if (rejected) {
        created.push(
          ...files
            .filter((f) => !accepted.includes(f))
            .map((file) => ({ key: `${file.name}-${Math.random().toString(36).slice(2, 7)}`, file, status: 'error' as const, percent: 0, message: 'Only PDF, CSV or TXT statements are supported.' })),
        )
      }
      setJobs((prev) => [...prev, ...created])
      void runAll(created.filter((j) => j.status === 'queued'))
    },
    [runAll],
  )

  const retryLocked = () => {
    const locked = jobs.filter((j) => j.status === 'locked')
    void runAll(locked)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const lockedCount = jobs.filter((j) => j.status === 'locked').length
  const busy = jobs.some((j) => j.status === 'working' || j.status === 'queued')

  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'relative overflow-hidden rounded-2xl border-2 border-dashed px-6 text-center transition-colors',
          compact ? 'py-6' : 'py-10',
          dragging ? 'border-accent bg-accent/10' : 'border-border bg-surface-2 hover:border-accent/40',
        )}
      >
        <motion.div animate={dragging ? { scale: 1.08, y: -2 } : { scale: 1, y: 0 }} className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <UploadCloud className="h-6 w-6" />
        </motion.div>
        <p className="text-sm font-medium text-text">Drop your statements here — as many as you like</p>
        <p className="mt-1 text-xs text-text-secondary">PDF (password-protected is fine), CSV or TXT · {kind === 'bank' ? 'ICICI or Axis account statements' : 'ICICI credit card statements — all your cards at once'}</p>
        <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" aria-label="Upload statements" onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        <button
          type="button"
          data-cursor="hover"
          onClick={() => inputRef.current?.click()}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
        >
          Choose files
        </button>
      </div>

      <div className={cn('rounded-xl border p-3.5', lockedCount ? 'border-amber-500/50 bg-amber-500/5' : 'border-border bg-surface-2')}>
        <label className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
          <span className="flex items-center gap-1.5 font-medium text-text">
            <KeyRound className="h-3.5 w-3.5" /> PDF password
          </span>
          <span className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              autoComplete="off"
              spellCheck={false}
              placeholder="Type once — unlocks all PDFs"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lockedCount > 0 && retryLocked()}
              className="w-80 max-w-full rounded-lg border border-border bg-card px-3 py-2 pr-9 font-mono text-xs text-text outline-none focus:border-accent/50"
            />
            <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text">
              {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </span>
          {lockedCount > 0 && (
            <button type="button" data-cursor="hover" disabled={!password || busy} onClick={retryLocked} className="rounded-full bg-amber-500 px-4 py-1.5 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50">
              Unlock {lockedCount} file{lockedCount === 1 ? '' : 's'}
            </button>
          )}
        </label>
        <p className="mt-2 text-[11px] text-text-secondary/80">
          The password is used once to unlock the PDF, is never stored, and the unlocked copy is saved to your private vault. Card statements are often locked with your name + date of birth.
        </p>
      </div>

      <ul className="space-y-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {jobs.map((j) => (
            <motion.li key={j.key} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="rounded-xl border border-border bg-surface-2 p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-text-secondary">
                  {j.status === 'done' ? <CheckCircle2 className="h-4.5 w-4.5 text-accent" /> : j.status === 'error' ? <AlertCircle className="h-4.5 w-4.5 text-error" /> : j.status === 'locked' ? <KeyRound className="h-4.5 w-4.5 text-amber-500" /> : j.status === 'working' ? <Loader2 className="h-4.5 w-4.5 animate-spin text-accent" /> : <FileText className="h-4.5 w-4.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-text">{j.file.name}</p>
                  <p className={cn('mt-0.5 text-[11px]', j.status === 'error' ? 'text-error' : j.status === 'locked' ? 'text-amber-500' : 'text-text-secondary')}>
                    {j.status === 'done' ? `${j.txns} transactions saved${j.message ? ` · ${j.message}` : ''}` : (j.message ?? j.stage ?? 'Waiting…')}
                  </p>
                </div>
                {j.status === 'error' && (j.prepared || j.resumeId) && (
                  <button
                    type="button"
                    data-cursor="hover"
                    disabled={busy}
                    onClick={() => void run(j)}
                    className="shrink-0 rounded-full border border-border px-3 py-1 text-[11px] font-medium text-text transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-50"
                  >
                    Retry
                  </button>
                )}
                {(j.status === 'done' || j.status === 'error' || j.status === 'locked') && (
                  <button type="button" aria-label={`Remove ${j.file.name} from list`} onClick={() => setJobs((prev) => prev.filter((x) => x.key !== j.key))} className="text-text-secondary hover:text-text">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {(j.status === 'working' || j.status === 'done') && (
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-10" role="progressbar" aria-valuenow={Math.round(j.percent)} aria-valuemin={0} aria-valuemax={100}>
                  <motion.div className={cn('h-full rounded-full', j.status === 'done' ? 'bg-accent' : 'bg-gradient-to-r from-accent to-sky-400')} animate={{ width: `${j.percent}%` }} transition={{ duration: 0.4 }} />
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}
