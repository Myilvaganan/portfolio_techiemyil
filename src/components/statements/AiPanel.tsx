import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, Lightbulb, RefreshCw, Send, ShieldAlert, Sparkles, XCircle } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/utils'
import type { AiInsights } from '@/lib/statements'
import { Reveal } from '@/components/viz/motion'

const TONE = {
  good: { icon: CheckCircle2, cls: 'text-accent border-accent/30 bg-accent/5' },
  warn: { icon: AlertTriangle, cls: 'text-amber-500 border-amber-500/30 bg-amber-500/5' },
  bad: { icon: XCircle, cls: 'text-error border-error/30 bg-error/5' },
  info: { icon: Info, cls: 'text-sky-500 border-sky-500/30 bg-sky-500/5' },
} as const

function ScoreRing({ value, label }: { value: number; label: string }) {
  const R = 44
  const C = 2 * Math.PI * R
  const color = value >= 70 ? 'var(--color-accent)' : value >= 45 ? '#f59e0b' : 'var(--color-error)'
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`Health score ${value} out of 100`}>
        <circle cx={50} cy={50} r={R} fill="none" stroke="currentColor" className="text-surface-7" strokeWidth={9} />
        <motion.circle cx={50} cy={50} r={R} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - value / 100) }} transition={{ duration: 1.3, ease: 'easeOut' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-2xl font-bold text-text">{value}</span>
        <span className="max-w-[8ch] text-[10px] leading-tight text-text-secondary">{label}</span>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="AI is analysing your statements">
      <div className="h-6 w-2/3 rounded bg-surface-10" />
      <div className="h-4 w-full rounded bg-surface-7" />
      <div className="h-4 w-5/6 rounded bg-surface-7" />
      <div className="grid gap-3 pt-2 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-surface-7" />
        ))}
      </div>
    </div>
  )
}

function Typed({ text }: { text: string }) {
  const reduce = useReducedMotion()
  const [n, setN] = useState(reduce ? text.length : 0)
  useEffect(() => {
    if (reduce) return
    setN(0)
    const id = setInterval(() => setN((v) => (v >= text.length ? (clearInterval(id), v) : v + 3)), 14)
    return () => clearInterval(id)
  }, [text, reduce])
  return <>{text.slice(0, n)}</>
}

// The panel takes on the mood of the analysis: green when things look healthy, amber for mixed, red when they don't.
function moodOf(score?: number) {
  if (score === undefined) return { surface: '', blob: 'bg-accent/10' }
  if (score >= 70) return { surface: 'border-accent/30 bg-gradient-to-br from-accent/[0.09] to-transparent', blob: 'bg-accent/20' }
  if (score >= 45) return { surface: 'border-amber-500/35 bg-gradient-to-br from-amber-500/[0.09] to-transparent', blob: 'bg-amber-500/20' }
  return { surface: 'border-error/35 bg-gradient-to-br from-error/[0.09] to-transparent', blob: 'bg-error/20' }
}

export function AiInsightsPanel({ insights, busy, error, onGenerate, hasData }: { insights: AiInsights | null; busy: boolean; error: string | null; onGenerate: () => void; hasData: boolean }) {
  const mood = moodOf(insights?.score.value)
  return (
    <GlassCard hover={false} className={cn('relative overflow-hidden p-5 transition-colors duration-700 md:p-6', mood.surface)}>
      <div className={cn('pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl transition-colors duration-700', mood.blob)} aria-hidden />
      <div className="relative">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            <Sparkles className="h-4 w-4 text-accent" /> AI analysis
            {insights && <span className="rounded-full bg-surface-10 px-2 py-0.5 text-[10px] font-normal normal-case tracking-normal">{insights.model}</span>}
          </h2>
          <button
            type="button"
            data-cursor="hover"
            disabled={busy || !hasData}
            onClick={onGenerate}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
            {insights ? 'Regenerate' : 'Analyse'}
          </button>
        </div>

        {error && <p role="alert" className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}
        {busy && !insights ? (
          <Skeleton />
        ) : !insights ? (
          <p className="py-6 text-center text-sm text-text-secondary">{hasData ? 'Preparing your analysis…' : 'Upload a statement and the AI will analyse it here.'}</p>
        ) : (
          <div className={cn('space-y-5 transition-opacity', busy && 'opacity-60')}>
            <div className="flex flex-wrap items-center gap-5">
              <ScoreRing value={insights.score.value} label={insights.score.label} />
              <div className="min-w-64 flex-1">
                <h3 className="font-display text-xl font-semibold leading-snug text-text">{insights.headline}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{insights.summary}</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {insights.highlights.map((h, i) => {
                const t = TONE[h.tone] ?? TONE.info
                return (
                  <Reveal key={h.title} delay={i * 0.05} y={14}>
                    <div className={cn('h-full rounded-xl border p-3.5', t.cls)}>
                      <p className="flex items-start gap-2 text-sm font-semibold">
                        <t.icon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="text-text">{h.title}</span>
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{h.detail}</p>
                    </div>
                  </Reveal>
                )
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary"><Lightbulb className="h-3.5 w-3.5 text-amber-500" /> What to do</p>
                <ol className="space-y-2.5">
                  {insights.tips.map((t, i) => (
                    <li key={t.title} className="flex gap-3 text-xs">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-[11px] font-bold text-accent">{i + 1}</span>
                      <span>
                        <span className="font-semibold text-text">{t.title}. </span>
                        <span className="leading-relaxed text-text-secondary">{t.detail}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              {insights.risks.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary"><ShieldAlert className="h-3.5 w-3.5 text-error" /> Watch out</p>
                  <ul className="space-y-2 text-xs leading-relaxed text-text-secondary">
                    {insights.risks.map((r) => (
                      <li key={r} className="rounded-lg border border-border bg-surface-2 p-2.5">{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <p className="text-[11px] text-text-secondary/70">Generated {new Date(insights.generatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} from your statements only. AI can make mistakes — check against the original statements.</p>
          </div>
        )}
      </div>
    </GlassCard>
  )
}

export function AskAi({ ask, suggestions, disabled }: { ask: (q: string) => Promise<string>; suggestions: string[]; disabled: boolean }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [turns, setTurns] = useState<{ q: string; a?: string; error?: string }[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  async function submit(question: string) {
    const text = question.trim()
    if (!text || busy) return
    setQ('')
    setBusy(true)
    setTurns((t) => [...t, { q: text }])
    try {
      const a = await ask(text)
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x)))
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: (e as Error).message } : x)))
    } finally {
      setBusy(false)
      setTimeout(() => endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }), 50)
    }
  }

  return (
    <GlassCard hover={false} className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        <Sparkles className="h-4 w-4 text-accent" /> Ask your statements
      </h2>
      <div className="mb-3 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button key={s} type="button" data-cursor="hover" disabled={disabled || busy} onClick={() => void submit(s)} className="rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text disabled:opacity-50">
            {s}
          </button>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {turns.map((t, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-3 space-y-2 text-sm">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-accent/15 px-3.5 py-2 text-text">{t.q}</p>
            <p className={cn('max-w-[92%] rounded-2xl rounded-bl-sm border px-3.5 py-2 leading-relaxed', t.error ? 'border-error/30 bg-error/10 text-error' : 'border-border bg-surface-2 text-text-secondary')}>
              {t.error ?? (t.a ? <Typed text={t.a} /> : <span className="inline-flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary [animation-delay:240ms]" /></span>)}
            </p>
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={endRef} />
      <form onSubmit={(e) => { e.preventDefault(); void submit(q) }} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} disabled={disabled} maxLength={400} placeholder={disabled ? 'Upload a statement first' : 'e.g. How much did I spend on food in August?'} aria-label="Ask a question about your statements" className="flex-1 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm text-text outline-none focus:border-accent/50 disabled:opacity-60" />
        <button type="submit" data-cursor="hover" disabled={disabled || busy || !q.trim()} aria-label="Send question" className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-bg transition-opacity hover:opacity-90 disabled:opacity-50">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </GlassCard>
  )
}
