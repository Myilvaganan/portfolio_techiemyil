import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { HandCoins, Plus, RefreshCw } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { AiInsightsPanel, AskAi } from '@/components/statements/AiPanel'
import { StatementUploader } from '@/components/statements/StatementUploader'
import { Card, Chips, Kpi } from '@/components/statements/parts'
import { AdvicePanel } from '@/components/loans/AdvicePanel'
import { Calculators } from '@/components/loans/Calculators'
import { CombinedBalanceChart, LoanCharts } from '@/components/loans/LoanCharts'
import { LoanDetailsCard } from '@/components/loans/LoanDetailsCard'
import { PaymentTimeline } from '@/components/loans/PaymentTimeline'
import { ScheduleTable } from '@/components/loans/ScheduleTable'
import { Reveal, ScrollProgress } from '@/components/viz/motion'
import { ReportMenu } from '@/components/viz/ReportMenu'
import { Pagination } from '@/components/viz/Pagination'
import { useLoans } from '@/hooks/useLoans'
import { loanReport, loanScheduleCsv } from '@/lib/loanReports'
import { DEFAULT_FEE, buildAdvice, daysBetween, loanInr, monthYear, monthsBetween, monthsSpan, totals, type FeeAssumption } from '@/lib/loans'
import { dayLabel } from '@/lib/statements'

const FEE_KEY = 'loan_fee_v1'
const SUGGESTIONS = ['How can I close my loans earliest?', 'Which loan should I prepay first?', 'How much do I save by adding ₹10,000 a month?', 'What did the bounced EMI cost me?']

function loadFee(): FeeAssumption {
  try {
    const raw = JSON.parse(localStorage.getItem(FEE_KEY) ?? 'null')
    if (raw && Number.isFinite(raw.feePct) && Number.isFinite(raw.gstPct)) return { feePct: raw.feePct, gstPct: raw.gstPct }
  } catch {
    // ignore
  }
  return DEFAULT_FEE
}

export function Loans() {
  const [fee, setFee] = useState<FeeAssumption>(loadFee)
  const [uploaderOpen, setUploaderOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState('')
  const [docPage, setDocPage] = useState(1)
  const s = useLoans(fee, !uploading)
  const { loans, data } = s

  useEffect(() => {
    try {
      localStorage.setItem(FEE_KEY, JSON.stringify(fee))
    } catch {
      // ignore
    }
  }, [fee])

  const loan = loans.find((l) => l.accountNo === selected) ?? loans[0]
  const t = useMemo(() => totals(loans), [loans])
  const advice = useMemo(() => buildAdvice(loans, fee), [loans, fee])
  const asOf = loans[0]?.asOf ?? ''
  const monthsToFree = t.debtFreeDate && asOf ? Math.max(0, monthsBetween(asOf, t.debtFreeDate)) : 0
  const nextLoan = [...loans].filter((l) => l.nextDue).sort((a, b) => a.nextDue!.date.localeCompare(b.nextDue!.date))[0]
  const daysToNext = nextLoan?.nextDue ? daysBetween(asOf, nextLoan.nextDue.date) : null
  const bounces = loans.reduce((n, l) => n + l.bounces, 0)
  const paidPct = t.principal ? (t.paidPrincipal / t.principal) * 100 : 0

  const hasData = loans.length > 0
  const showUploader = uploaderOpen || (!s.loading && !hasData)
  const docs = [...data.statements].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
  const docSize = 6
  const docPages = Math.max(1, Math.ceil(docs.length / docSize))
  const docCurrent = Math.min(docPage, docPages)

  return (
    <MotionConfig reducedMotion="user">
      <ScrollProgress />
      <div className="w-full space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">ICICI Bank</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-text md:text-3xl">Loans</h1>
            <p className="mt-1 max-w-2xl text-sm text-text-secondary">Upload each loan&apos;s account statement and amortization schedule — see every EMI, what you&apos;ve paid, and exactly how to close early.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button type="button" data-cursor="hover" onClick={() => setUploaderOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 font-semibold text-bg transition-opacity hover:opacity-90">
              <Plus className="h-3.5 w-3.5" /> {showUploader && hasData ? 'Hide uploader' : 'Add loan documents'}
            </button>
            <button type="button" data-cursor="hover" onClick={() => void s.reload()} aria-label="Refresh" className="rounded-full border border-border p-2 text-text-secondary transition-colors hover:border-accent/40 hover:text-text">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <ReportMenu disabled={!hasData} filename="loans-report" report={() => loanReport(loans, s.insights, fee)} csv={() => loanScheduleCsv(loans)} />
          </div>
        </div>

        {s.error && <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{s.error}</p>}

        <AnimatePresence initial={false}>
          {showUploader && (
            <motion.div key="uploader" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <GlassCard hover={false} className="p-5">
                <StatementUploader kind="loan" compact={hasData} onSaved={() => void s.reload()} onBusyChange={setUploading} />
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {s.loading ? (
          <GlassCard hover={false} className="flex items-center justify-center gap-3 py-24 text-sm text-text-secondary">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading your loans…
          </GlassCard>
        ) : !hasData ? (
          <Reveal>
            <GlassCard hover={false} className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <motion.span animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 3 }} className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <HandCoins className="h-7 w-7" />
              </motion.span>
              <h2 className="font-display text-xl font-semibold text-text">Add your loan documents</h2>
              <p className="max-w-md text-sm text-text-secondary">Drop the ICICI <strong className="text-text">Loan Account Statement</strong> and the <strong className="text-text">Amortization Schedule</strong> PDFs for each loan — all together. Type the password once if they are locked. Nothing personal (PAN, phone, address) is kept: only loan numbers and dates.</p>
            </GlassCard>
          </Reveal>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Outstanding" value={t.outstanding} tone="warn" sub={`${loanInr(t.paidPrincipal)} of ${loanInr(t.principal)} repaid`} />
              <Kpi label="Monthly EMIs" value={t.emi} sub={`${loans.length} loan${loans.length === 1 ? '' : 's'}`} delay={0.05} />
              <Kpi label="Interest still to pay" value={t.remainingInterest} tone="bad" sub={`${loanInr(t.monthlyInterestNow)} a month right now`} delay={0.1} />
              <Kpi label="Debt-free in" value={monthsToFree} format={(n) => monthsSpan(Math.round(n))} sub={t.debtFreeDate ? monthYear(t.debtFreeDate) : undefined} delay={0.15} />
              <Kpi label="Principal repaid" value={paidPct} format={(n) => `${n.toFixed(1)}%`} tone={paidPct > 50 ? 'good' : undefined} sub="across all loans" delay={0.2} />
              <Kpi
                label="Next EMI"
                value={daysToNext ?? 0}
                format={(n) => (daysToNext === null ? '—' : `${Math.round(n)} days`)}
                tone={daysToNext !== null && daysToNext <= 5 ? 'warn' : bounces > 0 ? undefined : 'good'}
                sub={nextLoan?.nextDue ? `${loanInr(nextLoan.nextDue.installment)} on ${dayLabel(nextLoan.nextDue.date)}` : undefined}
                delay={0.25}
              />
            </div>

            <Reveal>
              <AiInsightsPanel insights={s.insights} busy={s.insightsBusy} error={s.insightsError} onGenerate={() => void s.generate()} hasData={hasData} />
            </Reveal>

            <div className="grid gap-5 lg:grid-cols-2">
              {loans.map((l, i) => (
                <LoanDetailsCard key={l.accountNo} loan={l} index={i} />
              ))}
            </div>

            {loans.length > 1 && (
              <Card title="All loans — outstanding balance over time">
                <CombinedBalanceChart loans={loans} />
                <p className="mt-2 text-[11px] text-text-secondary">Where your combined debt stands month by month if every EMI is paid on schedule.</p>
              </Card>
            )}

            {loan && (
              <>
                {loans.length > 1 && <Chips label="Loan" value={loan.accountNo} onChange={setSelected} options={loans.map((l) => ({ id: l.accountNo, label: l.label }))} />}

                <Card title={`EMI schedule — ${loan.label}`}>
                  <ScheduleTable key={loan.accountNo} loan={loan} />
                </Card>

                <LoanCharts loan={loan} />

                <Card title={`Payment history — ${loan.label}`}>
                  <PaymentTimeline key={loan.accountNo} loan={loan} />
                </Card>
              </>
            )}

            <Reveal>
              <Calculators loans={loans} fee={fee} onFee={setFee} />
            </Reveal>

            <AdvicePanel items={advice} />

            <Card title={`Your documents (${docs.length})`}>
              {docs.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-secondary">Nothing uploaded yet.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {docs.slice((docCurrent - 1) * docSize, docCurrent * docSize).map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-text">{d.docType === 'schedule' ? 'Amortization schedule' : 'Loan account statement'} · ••{d.accountNo.slice(-4)}</span>
                        <span className="text-text-secondary">{d.filename} · {d.pages} page{d.pages === 1 ? '' : 's'} · added {dayLabel(d.uploadedAt.slice(0, 10))}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <button type="button" data-cursor="hover" onClick={() => void s.openFile(d.id)} className="rounded-full border border-border px-3 py-1.5 text-text-secondary transition-colors hover:border-accent/40 hover:text-text">
                          Unlocked copy
                        </button>
                        <button
                          type="button"
                          data-cursor="hover"
                          aria-label={`Delete ${d.filename}`}
                          onClick={() => window.confirm('Delete this document from your vault?') && void s.remove(d.id)}
                          className="rounded-full border border-border px-3 py-1.5 text-text-secondary transition-colors hover:border-error/40 hover:text-error"
                        >
                          Delete
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {docs.length > docSize && <Pagination page={docCurrent} pageSize={docSize} total={docs.length} onPage={setDocPage} />}
            </Card>

            <Reveal>
              <AskAi ask={s.ask} suggestions={SUGGESTIONS} disabled={!hasData} />
            </Reveal>
          </>
        )}
      </div>
    </MotionConfig>
  )
}
