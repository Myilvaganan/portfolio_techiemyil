import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, Landmark, XCircle } from 'lucide-react'
import { Chips } from '@/components/statements/parts'
import { Pagination } from '@/components/viz/Pagination'
import { cn } from '@/lib/utils'
import { dayLabel } from '@/lib/statements'
import { loanInr, type Loan } from '@/lib/loans'
import type { LoanEvent } from '@/lib/loanTypes'

type Filter = 'all' | 'payments' | 'issues'

const META: Partial<Record<LoanEvent['type'], { icon: typeof Info; tone: string; title: (e: LoanEvent) => string; group: 'payments' | 'issues' | 'other' }>> = {
  receipt: { icon: CheckCircle2, tone: 'text-positive bg-positive/10', title: () => 'Payment received', group: 'payments' },
  disbursement: { icon: Landmark, tone: 'text-sky-500 bg-sky-500/10', title: () => 'Loan disbursed', group: 'other' },
  processing_fee: { icon: Info, tone: 'text-amber-500 bg-amber-500/10', title: () => 'Processing fee (incl. GST)', group: 'other' },
  bounce: { icon: XCircle, tone: 'text-error bg-error/10', title: () => 'EMI bounced — insufficient funds', group: 'issues' },
  bounce_charge: { icon: AlertTriangle, tone: 'text-error bg-error/10', title: () => 'Cheque bounce charge', group: 'issues' },
  overdue_interest: { icon: AlertTriangle, tone: 'text-amber-500 bg-amber-500/10', title: (e) => `Interest on overdue instalment${e.instNo ? ` ${e.instNo}` : ''}`, group: 'issues' },
  penal: { icon: AlertTriangle, tone: 'text-amber-500 bg-amber-500/10', title: () => 'Penal charge for late payment', group: 'issues' },
  other_charge: { icon: Info, tone: 'text-amber-500 bg-amber-500/10', title: () => 'Other charge', group: 'issues' },
}

export function PaymentTimeline({ loan }: { loan: Loan }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)
  const events = useMemo(
    () =>
      loan.events
        .filter((e) => META[e.type])
        .sort((a, b) => b.date.localeCompare(a.date))
        .filter((e) => filter === 'all' || META[e.type]!.group === filter),
    [loan.events, filter],
  )
  const size = 8
  const pages = Math.max(1, Math.ceil(events.length / size))
  const current = Math.min(page, pages)
  const receipts = loan.events.filter((e) => e.type === 'receipt').length
  const issueCost = loan.penalties

  if (!loan.events.length) return <p className="py-6 text-center text-sm text-text-secondary">Upload the loan account statement to see your payment history.</p>

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Chips label="History filter" value={filter} onChange={(f) => { setFilter(f); setPage(1) }} options={[{ id: 'all', label: 'Everything' }, { id: 'payments', label: 'Payments' }, { id: 'issues', label: 'Issues & charges' }]} />
        <p className="text-xs text-text-secondary">
          {receipts} payments received{loan.bounces ? ` · ${loan.bounces} bounce costing ${loanInr(issueCost)}` : ' · no bounced EMIs'}
        </p>
      </div>
      <ol className="relative space-y-1 border-l border-border pl-5">
        {events.slice((current - 1) * size, current * size).map((e, i) => {
          const m = META[e.type]!
          return (
            <motion.li key={`${e.date}-${e.type}-${i}-${e.amount}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="relative flex items-center justify-between gap-3 py-2 text-xs">
              <span className={cn('absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full', m.tone)}>
                <m.icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-text">{m.title(e)}</span>
                <span className="text-text-secondary">{dayLabel(e.date)}{e.note && e.type !== 'processing_fee' ? ` · ${e.note}` : ''}</span>
              </span>
              <span className={cn('shrink-0 font-mono font-semibold', e.type === 'receipt' ? 'text-positive' : m.group === 'issues' ? 'text-error' : 'text-text')}>{loanInr(e.amount)}</span>
            </motion.li>
          )
        })}
      </ol>
      {events.length === 0 && <p className="py-6 text-center text-sm text-text-secondary">Nothing here — that&apos;s good news.</p>}
      <Pagination page={current} pageSize={size} total={events.length} onPage={setPage} />
    </div>
  )
}
