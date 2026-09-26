import { useMemo } from 'react'
import { detectRecurring } from '@/lib/recurring'
import { dayLabel, type Txn } from '@/lib/statements'
import { inr } from '@/components/statements/parts'

const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000)

// Subscriptions and EMIs detected from the transactions, with the next expected charge and any price change flagged.
export function RecurringCard({ txns, limit = 8 }: { txns: Txn[]; limit?: number }) {
  const items = useMemo(() => detectRecurring(txns), [txns])
  if (items.length === 0) return <p className="py-6 text-center text-sm text-text-secondary">Needs 3+ months of transactions to spot recurring charges.</p>
  return (
    <ul className="divide-y divide-border/60">
      {items.slice(0, limit).map((r) => {
        const days = daysUntil(r.nextDueDate)
        return (
          <li key={r.merchant} className="flex items-center justify-between gap-3 py-2 text-xs">
            <span className="min-w-0">
              <span className="block truncate font-medium text-text">{r.merchant}</span>
              <span className="text-text-secondary">
                Next due {dayLabel(r.nextDueDate)} {days >= 0 ? `(${days}d)` : '(overdue)'}
                {r.amountChanged && <span className={r.changePct > 0 ? 'ml-1.5 text-error' : 'ml-1.5 text-positive'}>· {r.changePct > 0 ? 'up' : 'down'} {Math.abs(r.changePct).toFixed(0)}%</span>}
              </span>
            </span>
            <span className="text-right font-mono text-text">
              {inr(r.lastAmount)}
              <span className="block text-[10px] text-text-secondary">{r.count} charges</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
