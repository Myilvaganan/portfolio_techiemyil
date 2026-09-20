import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, Check, CircleAlert, FileSpreadsheet } from 'lucide-react'
import { Chips } from '@/components/statements/parts'
import { Pagination } from '@/components/viz/Pagination'
import { cn } from '@/lib/utils'
import { downloadCsv, fileStamp } from '@/lib/report'
import { dayLabel } from '@/lib/statements'
import { loanInr, type Loan, type ScheduleLine } from '@/lib/loans'

type Filter = 'all' | 'paid' | 'upcoming'

const STATUS = {
  paid: { label: 'Paid', cls: 'bg-accent/15 text-accent', row: 'bg-accent/[0.07] hover:bg-accent/[0.12]' },
  due: { label: 'Next due', cls: 'bg-amber-500/20 text-amber-500', row: 'bg-amber-500/[0.10] hover:bg-amber-500/[0.15]' },
  overdue: { label: 'Overdue', cls: 'bg-error/15 text-error', row: 'bg-error/[0.08] hover:bg-error/[0.12]' },
  upcoming: { label: 'Upcoming', cls: 'bg-surface-10 text-text-secondary', row: 'hover:bg-surface-3' },
} as const

function Badge({ line }: { line: ScheduleLine }) {
  const s = STATUS[line.status]
  const Icon = line.status === 'paid' ? Check : line.status === 'due' ? CalendarClock : line.status === 'overdue' ? CircleAlert : null
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', s.cls)}>
      {Icon && <Icon className="h-3 w-3" />}
      {s.label}
    </span>
  )
}

export function ScheduleTable({ loan }: { loan: Loan }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [year, setYear] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)

  const years = useMemo(() => [...new Set(loan.schedule.map((r) => r.date.slice(0, 4)))], [loan.schedule])
  const rows = useMemo(
    () => loan.schedule.filter((r) => (filter === 'all' || (filter === 'paid' ? r.status === 'paid' : r.status !== 'paid')) && (year === 'all' || r.date.startsWith(year))),
    [loan.schedule, filter, year],
  )
  const paid = loan.schedule.filter((r) => r.status === 'paid')
  const paidTotal = paid.reduce((s, r) => s + r.installment, 0)

  // Open on the page that holds the next EMI, so "what's due" is the first thing you see.
  useEffect(() => {
    const idx = rows.findIndex((r) => r.status === 'due' || r.status === 'overdue')
    setPage(idx >= 0 && filter === 'all' && year === 'all' ? Math.floor(idx / pageSize) + 1 : 1)
  }, [loan.accountNo, filter, year, pageSize, rows])

  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pages)
  const visible = rows.slice((current - 1) * pageSize, current * pageSize)

  const exportCsv = () =>
    downloadCsv(
      `emi-schedule-${loan.short}-${fileStamp()}`,
      ['No', 'Due date', 'Status', 'Opening', 'Principal', 'Interest', 'EMI', 'Closing'],
      loan.schedule.map((r) => [r.no, r.date, STATUS[r.status].label, r.opening, r.principal, r.interest, r.installment, r.closing]),
    )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chips label="Show" value={filter} onChange={setFilter} options={[{ id: 'all', label: `All ${loan.schedule.length}` }, { id: 'paid', label: `Paid ${paid.length}` }, { id: 'upcoming', label: `Upcoming ${loan.schedule.length - paid.length}` }]} />
          <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Filter by year" className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-text outline-none focus:border-accent/50">
            <option value="all" className="bg-card">All years</option>
            {years.map((y) => (
              <option key={y} value={y} className="bg-card">{y}</option>
            ))}
          </select>
        </div>
        <button type="button" data-cursor="hover" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text">
          <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
        </button>
      </div>

      <p className="mb-3 text-xs text-text-secondary">
        <span className="font-semibold text-accent">{paid.length} paid</span> ({loanInr(paidTotal)}) · {loan.schedule.length - paid.length} to go ({loanInr(loan.remainingPayable)}). Green rows are EMIs already paid.
        {loan.scheduleEstimated ? ' This schedule is estimated from the loan terms — upload the amortization schedule PDF for the bank’s exact figures.' : ''}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-secondary">
              <th className="py-2 pl-2 pr-3 font-medium">#</th>
              <th className="py-2 pr-3 font-medium">Due date</th>
              <th className="py-2 pr-3 text-right font-medium">Opening</th>
              <th className="py-2 pr-3 text-right font-medium">Principal</th>
              <th className="py-2 pr-3 text-right font-medium">Interest</th>
              <th className="py-2 pr-3 text-right font-medium">EMI</th>
              <th className="py-2 pr-3 text-right font-medium">Closing</th>
              <th className="py-2 pr-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <motion.tr key={r.no} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i * 0.015, 0.25) }} className={cn('border-b border-border/60 transition-colors', STATUS[r.status].row)} aria-label={`Instalment ${r.no} ${STATUS[r.status].label}`}>
                <td className="py-2.5 pl-2 pr-3 font-mono text-text-secondary">{r.no}</td>
                <td className={cn('whitespace-nowrap py-2.5 pr-3 font-medium', r.status === 'paid' ? 'text-accent' : 'text-text')}>{dayLabel(r.date)}</td>
                <td className="py-2.5 pr-3 text-right font-mono text-text-secondary">{loanInr(r.opening)}</td>
                <td className="py-2.5 pr-3 text-right font-mono text-text">{loanInr(r.principal)}</td>
                <td className="py-2.5 pr-3 text-right font-mono text-text-secondary">{loanInr(r.interest)}</td>
                <td className="py-2.5 pr-3 text-right font-mono font-semibold text-text">{loanInr(r.installment)}</td>
                <td className="py-2.5 pr-3 text-right font-mono text-text-secondary">{loanInr(r.closing)}</td>
                <td className="py-2.5 pr-2 text-right"><Badge line={r} /></td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-8 text-center text-sm text-text-secondary">No instalments match this filter.</p>}
      </div>
      <Pagination page={current} pageSize={pageSize} total={rows.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1) }} sizes={[12, 24, 36, 72]} />
    </div>
  )
}
