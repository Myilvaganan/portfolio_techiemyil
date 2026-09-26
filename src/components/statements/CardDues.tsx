import { useMemo } from 'react'
import { CalendarClock } from 'lucide-react'
import { Reveal } from '@/components/viz/motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { buildCardDues, type CardDue } from '@/lib/cardDues'
import type { Statement, Txn } from '@/lib/statements'
import { useMoney } from '@/lib/privacy'
import { cn } from '@/lib/utils'

function dueTone(c: CardDue) {
  if (c.settled) return { text: 'text-positive', label: 'Paid' }
  if (c.overdue) return { text: 'text-error', label: `Overdue ${-(c.daysLeft ?? 0)}d` }
  if (c.daysLeft === null) return { text: 'text-text-secondary', label: 'No due date' }
  if (c.daysLeft <= 5) return { text: 'text-amber-500', label: c.daysLeft === 0 ? 'Due today' : `${c.daysLeft}d left` }
  return { text: 'text-text-secondary', label: `${c.daysLeft}d left` }
}

export function CardDues({ txns, statements }: { txns: Txn[]; statements: Statement[] }) {
  const money = useMoney()
  const today = new Date().toISOString().slice(0, 10)
  const cards = useMemo(() => buildCardDues(txns, statements, today), [txns, statements, today])
  if (cards.length === 0) return null
  return (
    <Reveal>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        <CalendarClock className="h-3.5 w-3.5 text-accent" /> Dues &amp; utilisation
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const tone = dueTone(c)
          const util = c.utilisation
          return (
            <GlassCard key={c.key} hover={false} className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-xs font-semibold text-text">{c.label}</p>
                <span className={cn('shrink-0 text-[11px] font-semibold', tone.text)}>{tone.label}</span>
              </div>
              <p className="mt-1.5 font-mono text-lg font-semibold text-text">{c.totalDue !== null ? money.inr(c.totalDue) : '—'}</p>
              <p className="text-[11px] text-text-secondary">
                {c.dueDate ? `${c.estimated ? 'Est. due' : 'Due'} ${c.dueDate}` : 'Due date unknown'}
                {c.minDue !== null && ` · min ${money.inr(c.minDue)}`}
              </p>
              <div className="mt-2.5" title={util === null ? 'Credit limit not on this statement' : `${util.toFixed(0)}% of limit used`}>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-7">
                  <div className={cn('h-full rounded-full', util === null ? 'bg-transparent' : util > 70 ? 'bg-error' : util > 30 ? 'bg-amber-500' : 'bg-positive')} style={{ width: `${Math.min(100, util ?? 0)}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-text-secondary">
                  <span>{util === null ? 'Limit unknown' : `${util.toFixed(0)}% of ${money.inr(c.limit ?? 0)}`}</span>
                  <span>Interest {money.inr(c.interestPaid)}{c.feesPaid > 0 && ` · fees ${money.inr(c.feesPaid)}`}</span>
                </div>
              </div>
            </GlassCard>
          )
        })}
      </div>
    </Reveal>
  )
}
