import type { ReportDoc } from './report'
import { buildAdvice, foreclosure, loanInr, monthYear, monthsSpan, remainingMonths, totals, type FeeAssumption, type Loan } from './loans'
import { dayLabel, type AiInsights } from './statements'

export function loanReport(loans: Loan[], ai: AiInsights | null, fee: FeeAssumption): ReportDoc {
  const t = totals(loans)
  const advice = buildAdvice(loans, fee)
  return {
    title: 'Loans report',
    subtitle: `${loans.length} loan${loans.length === 1 ? '' : 's'} · as of ${loans[0] ? dayLabel(loans[0].asOf) : '—'} · pre-closure fee assumed ${fee.feePct}% + ${fee.gstPct}% GST`,
    sections: [
      {
        title: 'Summary',
        kpis: [
          { label: 'Outstanding', value: loanInr(t.outstanding), tone: 'warn' },
          { label: 'Monthly EMIs', value: loanInr(t.emi) },
          { label: 'Interest still to pay', value: loanInr(t.remainingInterest), tone: 'bad' },
          { label: 'Debt-free', value: t.debtFreeDate ? monthYear(t.debtFreeDate) : '—' },
          { label: 'Fees & penalties paid', value: loanInr(t.fees + t.penalties) },
        ],
      },
      ...(ai ? [{ title: 'AI analysis', note: `Score ${ai.score.value}/100 — ${ai.score.label} · ${ai.model}`, text: `${ai.headline}. ${ai.summary}`, bullets: [...ai.highlights.map((h) => ({ text: `${h.title}: ${h.detail}`, tone: h.tone })), ...ai.tips.map((x) => ({ text: `${x.title}. ${x.detail}`, tone: 'info' as const }))] }] : []),
      { title: 'How to close early', bullets: advice.map((a) => ({ text: `${a.title}. ${a.detail}${a.impact ? ` (${a.impact})` : ''}`, tone: a.tone })) },
      {
        title: 'Loan details',
        table: {
          columns: ['Loan', 'Amount', 'Rate', 'EMI', 'Paid', 'Outstanding', 'Interest to come', 'Ends', 'Close-now cost'],
          rows: loans.map((l) => [l.label, loanInr(l.principal), `${l.ratePct}%`, loanInr(l.emi), `${l.paidCount}/${l.schedule.length || l.tenure}`, loanInr(l.outstanding), loanInr(l.remainingInterest), l.endDate ? monthYear(l.endDate) : '—', loanInr(foreclosure(l, fee).total)]),
          rightAlign: [1, 2, 3, 4, 5, 6, 8],
        },
      },
      ...loans.flatMap((l) => [
        {
          title: `${l.label} — EMI schedule`,
          note: `${l.paidCount} paid · ${remainingMonths(l)} to go (${monthsSpan(remainingMonths(l))})`,
          table: {
            columns: ['#', 'Due date', 'Status', 'Principal', 'Interest', 'EMI', 'Closing balance'],
            rows: l.schedule.map((r) => [r.no, dayLabel(r.date), r.status === 'paid' ? 'Paid ✓' : r.status === 'due' ? 'Next due' : r.status === 'overdue' ? 'Overdue' : 'Upcoming', loanInr(r.principal), loanInr(r.interest), loanInr(r.installment), loanInr(r.closing)]),
            rightAlign: [0, 3, 4, 5, 6],
          },
        },
      ]),
    ],
  }
}

export function loanScheduleCsv(loans: Loan[]) {
  return {
    filename: 'loan-schedules',
    columns: ['Loan', 'No', 'Due date', 'Status', 'Opening', 'Principal', 'Interest', 'EMI', 'Closing'],
    rows: loans.flatMap((l) => l.schedule.map((r) => [l.label, r.no, r.date, r.status, r.opening, r.principal, r.interest, r.installment, r.closing])),
  }
}
