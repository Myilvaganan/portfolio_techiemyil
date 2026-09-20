import { motion } from 'framer-motion'
import { AlertTriangle, BadgeCheck, CalendarClock, Landmark } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Reveal } from '@/components/viz/motion'
import { cn } from '@/lib/utils'
import { dayLabel } from '@/lib/statements'
import { loanInr, monthsSpan, progressPct, remainingMonths, type Loan } from '@/lib/loans'

function Fact({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' | 'bad' | 'good' }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={cn('mt-0.5 truncate font-mono text-sm font-semibold text-text', tone === 'warn' && 'text-amber-500', tone === 'bad' && 'text-error', tone === 'good' && 'text-accent')}>{value}</p>
      {sub && <p className="text-[11px] text-text-secondary">{sub}</p>}
    </div>
  )
}

export function LoanDetailsCard({ loan, index }: { loan: Loan; index: number }) {
  const total = loan.schedule.length || loan.tenure
  const paidPct = total ? (loan.paidCount / total) * 100 : 0
  const days = loan.daysToNextDue
  const soon = days !== null && days <= 5
  const d = loan.details
  return (
    <Reveal delay={index * 0.08} className="h-full">
      <GlassCard hover className="h-full p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <Landmark className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-lg font-semibold text-text">{loan.label}</h3>
              <p className="text-xs text-text-secondary">
                ICICI Bank · {d?.rateType ?? 'Fixed'} rate · sanctioned {dayLabel(loan.sanctionDate)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 font-semibold text-accent">
              <BadgeCheck className="h-3 w-3" /> {d?.status ?? 'Active'}
            </span>
            {loan.bounces > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-error/15 px-2.5 py-1 font-semibold text-error">
                <AlertTriangle className="h-3 w-3" /> {loan.bounces} bounced EMI
              </span>
            )}
            {loan.scheduleEstimated && <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-semibold text-amber-500">Schedule estimated — upload the schedule PDF</span>}
            {!loan.hasStatement && <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-semibold text-amber-500">Add the loan statement for exact balances</span>}
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="font-medium text-text">
              {loan.paidCount} of {total} EMIs paid
            </span>
            <span className="font-mono text-text-secondary">{progressPct(loan).toFixed(1)}% of principal repaid</span>
          </div>
          <div className="relative h-3 overflow-hidden rounded-full bg-surface-10" role="progressbar" aria-label="EMIs paid" aria-valuenow={Math.round(paidPct)} aria-valuemin={0} aria-valuemax={100}>
            <motion.div className="h-full rounded-full bg-gradient-to-r from-accent to-emerald-400" initial={{ width: 0 }} animate={{ width: `${paidPct}%` }} transition={{ duration: 1.1, ease: 'easeOut' }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-text-secondary">
            <span>{dayLabel(loan.sanctionDate)}</span>
            <span>{loan.endDate ? `Ends ${dayLabel(loan.endDate)}` : ''}</span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          <Fact label="Loan amount" value={loanInr(loan.principal)} />
          <Fact label="Outstanding" value={loanInr(loan.outstanding)} sub={loan.accrued ? `+ ${loanInr(loan.accrued)} accrued interest` : undefined} tone="warn" />
          <Fact label="EMI" value={loanInr(loan.emi)} sub={d?.repayment ? d.repayment.toLowerCase() : undefined} />
          <Fact label="Interest rate" value={`${loan.ratePct}% p.a.`} sub={loan.effectiveRatePct ? `${loan.effectiveRatePct.toFixed(2)}% with fees` : undefined} />
          <Fact label="Tenure" value={`${loan.tenure} months`} sub={monthsSpan(remainingMonths(loan)) + ' left'} />
          <Fact
            label="Next EMI"
            value={loan.nextDue ? dayLabel(loan.nextDue.date) : '—'}
            sub={days === null ? undefined : days < 0 ? `${-days} days overdue` : days === 0 ? 'due today' : `in ${days} days`}
            tone={days !== null && days < 0 ? 'bad' : soon ? 'warn' : undefined}
          />
          <Fact label="Interest paid" value={loanInr(loan.paidInterest)} />
          <Fact label="Interest to come" value={loanInr(loan.remainingInterest)} tone="warn" />
          <Fact label="Fees & penalties" value={loanInr(loan.processingFee + loan.penalties)} sub={loan.processingFee ? `${loanInr(loan.processingFee)} processing fee` : undefined} tone={loan.penalties > 0 ? 'bad' : undefined} />
        </div>

        {loan.nextDue && (
          <p className={cn('mt-5 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs', soon ? 'border-amber-500/40 bg-amber-500/10 text-amber-500' : 'border-border bg-surface-2 text-text-secondary')}>
            <CalendarClock className="h-4 w-4 shrink-0" />
            Instalment {loan.nextDue.no}: {loanInr(loan.nextDue.installment)} auto-debits on {dayLabel(loan.nextDue.date)} — {loanInr(loan.nextDue.principal)} principal, {loanInr(loan.nextDue.interest)} interest.
          </p>
        )}
      </GlassCard>
    </Reveal>
  )
}
