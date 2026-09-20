import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Reveal } from '@/components/viz/motion'
import { cn } from '@/lib/utils'
import type { AdviceItem } from '@/lib/loans'

const TONE = {
  good: { icon: CheckCircle2, cls: 'text-accent border-accent/30 bg-accent/5' },
  warn: { icon: AlertTriangle, cls: 'text-amber-500 border-amber-500/30 bg-amber-500/5' },
  bad: { icon: XCircle, cls: 'text-error border-error/30 bg-error/5' },
  info: { icon: Info, cls: 'text-sky-500 border-sky-500/30 bg-sky-500/5' },
} as const

export function AdvicePanel({ items }: { items: AdviceItem[] }) {
  if (!items.length) return null
  return (
    <GlassCard hover={false} className="p-5">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">How to close your loans early — your playbook</h2>
      <p className="mb-4 text-xs text-text-secondary">Every figure below is calculated from your own schedules and statements (using the pre-closure fee assumption in the calculators).</p>
      <ol className="grid gap-3 md:grid-cols-2">
        {items.map((a, i) => {
          const t = TONE[a.tone]
          return (
            <Reveal key={a.title} delay={i * 0.04} y={14}>
              <li className={cn('h-full list-none rounded-xl border p-4', t.cls)}>
                <p className="flex items-start gap-2 text-sm font-semibold text-text">
                  <t.icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{i + 1}. {a.title}</span>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{a.detail}</p>
                {a.impact && <p className="mt-2 inline-block rounded-full bg-surface-10 px-2.5 py-1 font-mono text-[11px] font-semibold text-text">{a.impact}</p>}
              </li>
            </Reveal>
          )
        })}
      </ol>
    </GlassCard>
  )
}
