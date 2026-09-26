import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { motion } from 'framer-motion'
import { Calculator, CalendarClock, ChevronDown, HandCoins, Loader2, Pencil, Phone, Plus, Trash2, Users, X } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { HideNumbersButton } from '@/components/journal/chrome'
import { cn } from '@/lib/utils'
import { useMoney } from '@/lib/privacy'
import { todayStr } from '@/lib/journal'
import { blankEntry, owedOn, passThrough, summarize, type EntryDraft, type LendingEntry, type PassThroughLoan, type Repayment } from '@/lib/lending'
import { deleteLending, fetchLending, saveLending } from '@/lib/lendingApi'

const dayLabel = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
const field = 'w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/30'
const compact = 'h-9 w-full rounded-lg border border-border bg-surface-2 px-2.5 text-sm text-text outline-none transition-colors focus:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/30'
const label = 'mb-1.5 block label-caps'

function Field({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {title}
      </label>
      {children}
      {hint && <p className="mt-1 text-2xs text-text-secondary">{hint}</p>}
    </div>
  )
}

const numberOf = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(/,/g, '')))

// ---------- Add / edit a person ----------

function EntryDialog({ open, initial, onClose, onSave }: { open: boolean; initial: EntryDraft | LendingEntry | null; onClose: () => void; onSave: (e: EntryDraft | LendingEntry) => Promise<void> }) {
  const [draft, setDraft] = useState<EntryDraft | LendingEntry | null>(initial)
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('')
  const [loan, setLoan] = useState({ loanAmount: '', ratePct: '', years: '', firstEmiDate: '' })
  const [borrowed, setBorrowed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraft(initial)
    setError('')
    if (!initial) return
    setAmount(initial.amount ? String(initial.amount) : '')
    setRate(initial.interestRatePct ? String(initial.interestRatePct) : '')
    const p = initial.passThrough
    setBorrowed(Boolean(p))
    setLoan(p ? { loanAmount: String(p.loanAmount), ratePct: String(p.ratePct), years: String(p.tenureMonths / 12), firstEmiDate: p.firstEmiDate } : { loanAmount: '', ratePct: '', years: '', firstEmiDate: '' })
  }, [initial])

  if (!draft) return null
  const set = <K extends keyof EntryDraft>(k: K, v: EntryDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    setError('')
    let passThroughLoan: PassThroughLoan | null = null
    if (borrowed) {
      const tenureMonths = Math.round(numberOf(loan.years) * 12)
      if (!numberOf(loan.loanAmount) || !tenureMonths || !loan.firstEmiDate || loan.ratePct.trim() === '') {
        setError('Fill in every field of the loan you took, or turn that section off.')
        return
      }
      passThroughLoan = { loanAmount: numberOf(loan.loanAmount), ratePct: numberOf(loan.ratePct), tenureMonths, firstEmiDate: loan.firstEmiDate }
    }
    setBusy(true)
    try {
      await onSave({ ...draft, amount: numberOf(amount), interestRatePct: numberOf(rate), passThrough: passThroughLoan })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay data-native-cursor className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content data-native-cursor aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-[151] max-h-[92vh] w-[94vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="font-display text-lg font-semibold text-text">{'id' in draft && draft.id ? 'Edit' : 'Add someone who owes you'}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="rounded-full border border-border p-1.5 text-text-secondary hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="l-name" title="Name">
                <input id="l-name" required autoFocus value={draft.name} onChange={(e) => set('name', e.target.value)} className={field} placeholder="Who has it?" />
              </Field>
              <Field id="l-phone" title="Phone (optional)">
                <input id="l-phone" value={draft.phone} onChange={(e) => set('phone', e.target.value)} className={field} inputMode="tel" />
              </Field>
              <Field id="l-amount" title="Amount lent (₹)">
                <input id="l-amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} placeholder="650000" />
              </Field>
              <Field id="l-date" title="Date lent">
                <input id="l-date" required type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} className={field} />
              </Field>
              <Field id="l-due" title="Due date (optional)" hint="Shows as late after this day.">
                <input id="l-due" type="date" value={draft.dueDate} onChange={(e) => set('dueDate', e.target.value)} className={field} />
              </Field>
              <Field id="l-rate" title="Interest they owe (% a year)" hint="Simple interest. Leave empty for none.">
                <input id="l-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={field} placeholder="0" />
              </Field>
            </div>
            <Field id="l-note" title="Note">
              <input id="l-note" value={draft.note} onChange={(e) => set('note', e.target.value)} className={field} placeholder="What it was for" />
            </Field>

            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-text">
                <input type="checkbox" checked={borrowed} onChange={(e) => setBorrowed(e.target.checked)} className="mt-1 accent-[var(--color-accent)]" />
                <span>
                  I borrowed this money on a loan and they pay part of my EMI
                  <span className="block text-xs text-text-secondary">Adds the pass-through calculation for this person.</span>
                </span>
              </label>
              {borrowed && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field id="p-amt" title="Loan I took (₹)">
                    <input id="p-amt" inputMode="decimal" value={loan.loanAmount} onChange={(e) => setLoan({ ...loan, loanAmount: e.target.value })} className={field} placeholder="1500000" />
                  </Field>
                  <Field id="p-rate" title="Loan interest (% a year)">
                    <input id="p-rate" inputMode="decimal" value={loan.ratePct} onChange={(e) => setLoan({ ...loan, ratePct: e.target.value })} className={field} placeholder="9.99" />
                  </Field>
                  <Field id="p-years" title="Loan term (years)">
                    <input id="p-years" inputMode="decimal" value={loan.years} onChange={(e) => setLoan({ ...loan, years: e.target.value })} className={field} placeholder="6" />
                  </Field>
                  <Field id="p-first" title="First EMI date">
                    <input id="p-first" type="date" value={loan.firstEmiDate} onChange={(e) => setLoan({ ...loan, firstEmiDate: e.target.value })} className={field} />
                  </Field>
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="text-xs text-error">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" magnetic={false} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" size="sm" magnetic={false} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ---------- One person ----------

function PersonCard({ e, today, onEdit, onDelete, onSave, onSplit }: { e: LendingEntry; today: string; onEdit: () => void; onDelete: () => void; onSave: (e: LendingEntry) => Promise<void>; onSplit: () => void }) {
  const m = useMoney()
  const o = owedOn(e, today)
  const [open, setOpen] = useState(false)
  const [payDate, setPayDate] = useState(today)
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [err, setErr] = useState('')
  const total = o.principal + o.interest
  const pct = total > 0 ? Math.min(100, (o.received / total) * 100) : 0
  const tone = o.status === 'settled' ? 'text-positive' : o.status === 'overdue' ? 'text-error' : 'text-text'

  async function addPayment(ev: FormEvent) {
    ev.preventDefault()
    const amount = numberOf(payAmount)
    if (!amount) return
    setErr('')
    try {
      const r: Repayment = { id: '', date: payDate, amount, note: payNote }
      await onSave({ ...e, repayments: [...e.repayments, r] })
      setPayAmount('')
      setPayNote('')
    } catch (x) {
      setErr((x as Error).message)
    }
  }

  return (
    <GlassCard hover={false} className="relative overflow-hidden p-4">
      <span aria-hidden className={cn('pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl', o.status === 'overdue' ? 'bg-error' : o.status === 'settled' ? 'bg-positive' : 'bg-accent')} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate card-title">{e.name}</h3>
          <p className="truncate text-xs text-text-secondary">
            Lent {dayLabel(e.date)}
            {e.note ? ` · ${e.note}` : ''}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1">
          <button type="button" aria-label={`Edit ${e.name}`} onClick={onEdit} className="rounded-md p-1.5 text-text-secondary hover:bg-surface-3 hover:text-text">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label={`Delete ${e.name}`} onClick={onDelete} className="rounded-md p-1.5 text-text-secondary hover:bg-error/10 hover:text-error">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="label-caps">{o.status === 'settled' ? 'Settled' : 'Still owes you'}</p>
          <p className={cn('font-mono text-2xl font-semibold leading-tight', tone)}>{m.inr(o.outstanding)}</p>
        </div>
        {o.status === 'overdue' && <span className="rounded-full bg-error/10 px-2 py-0.5 text-2xs font-semibold text-error">{o.overdueDays} days late</span>}
        {o.status === 'open' && e.dueDate && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-2xs text-text-secondary">due {dayLabel(e.dueDate)}</span>}
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${Math.round(pct)}% received`}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} className="h-full rounded-full bg-positive" />
      </div>
      <p className="mt-1.5 text-2xs text-text-secondary">
        {m.inr(o.received)} received of {m.inr(total)}
        {o.interest > 0 && <> · includes {m.inr(o.interest)} interest</>}
        {o.lastRepayment && <> · last paid {dayLabel(o.lastRepayment.date)}</>}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" magnetic={false} onClick={() => setOpen((v) => !v)} className="!h-8 !px-3 !text-xs">
          <Plus className="h-3.5 w-3.5" /> Payment received
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </Button>
        {e.passThrough && (
          <button type="button" onClick={onSplit} className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 px-3 py-1.5 text-xs text-accent hover:bg-accent/10">
            <Calculator className="h-3.5 w-3.5" /> EMI split
          </button>
        )}
        {e.phone && (
          <a href={`tel:${e.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text">
            <Phone className="h-3.5 w-3.5" /> {e.phone}
          </a>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-2.5 border-t border-border pt-3">
          <form onSubmit={(ev) => void addPayment(ev)} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={`pd-${e.id}`} className="mb-1 block label-caps">
                  Date
                </label>
                <input id={`pd-${e.id}`} aria-label="Payment date" type="date" value={payDate} onChange={(ev) => setPayDate(ev.target.value)} className={compact} />
              </div>
              <div>
                <label htmlFor={`pa-${e.id}`} className="mb-1 block label-caps">
                  Amount (₹)
                </label>
                <input id={`pa-${e.id}`} aria-label="Payment amount" inputMode="decimal" placeholder="0" value={payAmount} onChange={(ev) => setPayAmount(ev.target.value)} className={cn(compact, 'font-mono')} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input aria-label="Payment note" placeholder="Note (optional)" value={payNote} onChange={(ev) => setPayNote(ev.target.value)} className={cn(compact, 'min-w-0 flex-1')} />
              <Button type="submit" size="sm" magnetic={false} disabled={!numberOf(payAmount)} className="!h-9 shrink-0 !px-5 !text-xs">
                Add
              </Button>
            </div>
          </form>
          {err && (
            <p role="alert" className="text-xs text-error">
              {err}
            </p>
          )}
          {e.repayments.length === 0 ? (
            <p className="text-xs text-text-secondary">No payments yet.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto pr-1 text-xs">
              {[...e.repayments].reverse().map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 border-b border-border/60 py-1">
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-text-secondary">{r.date}</span>
                    {r.note && <span className="ml-2 text-text-secondary">{r.note}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono font-semibold text-positive">{m.inr(r.amount)}</span>
                    <button type="button" aria-label={`Remove payment of ${r.amount} on ${r.date}`} onClick={() => void onSave({ ...e, repayments: e.repayments.filter((x) => x.id !== r.id) }).catch((x: Error) => setErr(x.message))} className="text-text-secondary hover:text-error">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </GlassCard>
  )
}

// ---------- The pass-through calculator ----------

const DEFAULTS = { loanAmount: '1500000', ratePct: '9.99', years: '6', firstEmiDate: '2025-11-05', given: '650000', paid: '0' }

function Calculator_({ entries, selectedId, onSelect, onSaveLoan, today }: { entries: LendingEntry[]; selectedId: string; onSelect: (id: string) => void; onSaveLoan: (e: LendingEntry, loan: PassThroughLoan) => Promise<void>; today: string }) {
  const m = useMoney()
  const entry = entries.find((x) => x.id === selectedId) ?? null
  const [f, setF] = useState(DEFAULTS)
  const [showAll, setShowAll] = useState(false)
  const [saved, setSaved] = useState('')

  // Choosing a person fills the form from what is saved for them; "Custom" keeps whatever is typed.
  useEffect(() => {
    if (!entry) return
    const p = entry.passThrough
    setF({
      loanAmount: p ? String(p.loanAmount) : DEFAULTS.loanAmount,
      ratePct: p ? String(p.ratePct) : DEFAULTS.ratePct,
      years: p ? String(p.tenureMonths / 12) : DEFAULTS.years,
      firstEmiDate: p ? p.firstEmiDate : '',
      given: String(entry.amount),
      paid: String(entry.repayments.reduce((s, r) => s + r.amount, 0)),
    })
    setSaved('')
  }, [entry])

  const loan: PassThroughLoan = { loanAmount: numberOf(f.loanAmount), ratePct: numberOf(f.ratePct), tenureMonths: Math.round(numberOf(f.years) * 12), firstEmiDate: f.firstEmiDate }
  const ready = loan.loanAmount > 0 && loan.tenureMonths > 0 && Boolean(loan.firstEmiDate) && numberOf(f.given) > 0
  const r = useMemo(() => (ready ? passThrough(loan, numberOf(f.given), numberOf(f.paid), today) : null), [ready, f, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof DEFAULTS) => (ev: { target: { value: string } }) => setF((x) => ({ ...x, [k]: ev.target.value }))

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <GlassCard hover={false} className="h-fit space-y-3 p-4">
        <h2 className="label-caps">Your loan and what you passed on</h2>
        <Field id="c-who" title="For">
          <select id="c-who" value={selectedId} onChange={(ev) => onSelect(ev.target.value)} className={field}>
            <option value="">Custom (not saved)</option>
            {entries.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {m.hidden ? '****' : `₹${x.amount.toLocaleString('en-IN')}`}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="c-loan" title="Loan I took (₹)">
            <input id="c-loan" inputMode="decimal" value={f.loanAmount} onChange={set('loanAmount')} className={field} />
          </Field>
          <Field id="c-rate" title="Interest (% a year)">
            <input id="c-rate" inputMode="decimal" value={f.ratePct} onChange={set('ratePct')} className={field} />
          </Field>
          <Field id="c-years" title="Term (years)">
            <input id="c-years" inputMode="decimal" value={f.years} onChange={set('years')} className={field} />
          </Field>
          <Field id="c-first" title="First EMI date">
            <input id="c-first" type="date" value={f.firstEmiDate} onChange={set('firstEmiDate')} className={field} />
          </Field>
          <Field id="c-given" title="I passed on (₹)">
            <input id="c-given" inputMode="decimal" value={f.given} onChange={set('given')} className={field} />
          </Field>
          <Field id="c-paid" title="They paid so far (₹)" hint={entry ? 'From their recorded payments.' : undefined}>
            <input id="c-paid" inputMode="decimal" value={f.paid} onChange={set('paid')} className={field} readOnly={Boolean(entry)} />
          </Field>
        </div>
        {entry && (
          <Button
            size="sm"
            variant="secondary"
            magnetic={false}
            disabled={!ready}
            onClick={() => void onSaveLoan(entry, loan).then(() => setSaved('Saved to ' + entry.name))}
          >
            Save this loan to {entry.name}
          </Button>
        )}
        {saved && <p role="status" className="text-xs text-positive">{saved}</p>}
        <p className="text-2xs leading-relaxed text-text-secondary">
          They pay the same share of every EMI as the share of your loan you passed on. Interest is on the reducing balance, like the bank&apos;s schedule.
        </p>
      </GlassCard>

      <div className="space-y-4">
        {!r ? (
          <GlassCard hover={false} className="p-6 text-sm text-text-secondary">
            Enter the first EMI date to see how much they owe you today.
          </GlassCard>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi label="They owe you now" value={m.inr(r.arrears)} sub={r.ahead > 0 ? `Paid ahead by ${m.inr(r.ahead)}` : r.arrears === 0 ? 'Up to date' : `${r.monthsBehind} month${r.monthsBehind === 1 ? '' : 's'} behind`} tone={r.arrears > 0 ? 'bad' : 'good'} big />
              <Kpi label="Their EMI a month" value={m.inr(r.theirMonthlyEmi)} sub={`${(r.share * 100).toFixed(1)}% of ${m.inr(r.emi)}`} />
              <Kpi label="Should have paid by today" value={m.inr(r.dueSoFar)} sub={`${r.instalmentsDue} of ${r.tenure} EMIs · paid ${m.inr(r.paid)}`} />
              <Kpi label="To settle everything today" value={m.inr(r.settleToday)} sub={`${m.inr(r.theirOutstandingPrincipal)} principal left + arrears`} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi label="Next EMI" value={r.next ? m.inr(r.next.amount) : '—'} sub={r.next ? dayLabel(r.next.date) : 'All EMIs are past'} />
              <Kpi label="Their total over the term" value={m.inr(r.totalOverTenure)} sub={`${m.inr(r.totalInterest)} of it is interest`} />
              <Kpi label="Your own EMI share" value={m.inr(r.myMonthlyEmi)} sub={`on the ${m.inr(loan.loanAmount - numberOf(f.given))} you kept`} />
              <Kpi label="Loan ends" value={dayLabel(r.endDate)} sub={`${m.inr(r.loanTotalInterest)} total interest on the whole loan`} />
            </div>

            <GlassCard hover={false} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="label-caps">Their share, month by month</h2>
                <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs text-accent hover:underline">
                  {showAll ? 'Show fewer' : `Show all ${r.rows.length}`}
                </button>
              </div>
              <div className={cn('overflow-y-auto pr-1', showAll ? 'max-h-[28rem]' : 'max-h-64')}>
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border label-caps">
                      <th scope="col" className="py-2 pr-3 font-medium">#</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Their EMI</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Interest</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Principal</th>
                      <th scope="col" className="py-2 text-right font-medium">Balance left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAll ? r.rows : r.rows.slice(Math.max(0, r.instalmentsDue - 3), r.instalmentsDue + 5)).map((x) => (
                      <tr key={x.no} className={cn('border-b border-border/60', x.due ? 'text-text' : 'text-text-secondary', x.no === r.instalmentsDue + 1 && 'bg-accent/[0.06]')}>
                        <td className="py-2 pr-3 font-mono">{x.no}</td>
                        <td className="py-2 pr-3 font-mono">{x.date}</td>
                        <td className="py-2 pr-3 text-right font-mono">{m.inr(x.theirEmi)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{m.inr(x.theirInterest)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{m.inr(x.theirPrincipal)}</td>
                        <td className="py-2 text-right font-mono">{m.inr(x.theirBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-2xs text-text-secondary">Rows up to today are shaded normally; the highlighted row is the next EMI.</p>
            </GlassCard>
          </>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, tone, big }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad'; big?: boolean }) {
  return (
    <GlassCard hover={false} className="relative overflow-hidden px-4 py-3">
      {tone && <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', tone === 'bad' ? 'bg-error' : 'bg-positive')} />}
      <p className="label-caps">{label}</p>
      <p className={cn('mt-0.5 font-mono font-semibold text-text', big ? 'text-2xl' : 'text-xl', tone === 'bad' && 'text-error', tone === 'good' && 'text-positive')}>{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-text-secondary">{sub}</p>}
    </GlassCard>
  )
}

// ---------- The page ----------

/** Money other people owe me: a ledger with payments, and a calculator for a loan I took to lend to someone else. */
export function Lending() {
  const m = useMoney()
  const today = todayStr()
  const [entries, setEntries] = useState<LendingEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'owed' | 'calc'>('owed')
  const [dialog, setDialog] = useState<{ open: boolean; entry: EntryDraft | LendingEntry | null }>({ open: false, entry: null })
  const [calcFor, setCalcFor] = useState('')
  const [showSettled, setShowSettled] = useState(false)

  const load = useCallback(async () => {
    try {
      setEntries(await fetchLending())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const save = async (e: EntryDraft | LendingEntry) => setEntries(await saveLending(e))
  const list = entries ?? []
  const summary = useMemo(() => summarize(list, today), [list, today])
  const rows = useMemo(() => list.map((e) => ({ e, o: owedOn(e, today) })), [list, today])
  const open = rows.filter((r) => r.o.status !== 'settled').sort((a, b) => (a.o.status === 'overdue' ? -1 : 0) - (b.o.status === 'overdue' ? -1 : 0) || b.o.outstanding - a.o.outstanding)
  const settled = rows.filter((r) => r.o.status === 'settled')

  async function remove(e: LendingEntry) {
    if (!window.confirm(`Delete ${e.name} and their ${e.repayments.length} recorded payments?`)) return
    setEntries(await deleteLending(e.id))
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="page-eyebrow">Money owed to me</p>
          <h1 className="mt-1 page-title">Lending</h1>
          <p className="page-lede">Who owes you, what they have paid back, and what a friend owes on a loan you took for them.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Lending" className="inline-flex rounded-full border border-border bg-surface-2 p-0.5 text-sm">
            {([['owed', 'Owed to me', Users], ['calc', 'EMI split calculator', Calculator]] as const).map(([id, text, Icon]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => {
                  setTab(id)
                  // Opening the calculator starts on the first person who has a saved loan, so there is something to see.
                  if (id === 'calc' && !calcFor) setCalcFor(list.find((x) => x.passThrough)?.id ?? '')
                }} className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors', tab === id ? 'bg-accent/15 font-semibold text-accent' : 'text-text-secondary hover:text-text')}>
                <Icon className="h-3.5 w-3.5" /> {text}
              </button>
            ))}
          </div>
          <HideNumbersButton />
          <Button size="sm" magnetic={false} onClick={() => setDialog({ open: true, entry: blankEntry(today) })} className="!h-9 !px-4 !text-xs">
            <Plus className="h-3.5 w-3.5" /> Add person
          </Button>
        </div>
      </div>

      {error && (
        <GlassCard hover={false} className="p-4 text-sm text-error" role="alert">
          {error}
        </GlassCard>
      )}

      {!entries && !error ? (
        <GlassCard hover={false} className="flex items-center justify-center gap-2 p-12 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </GlassCard>
      ) : tab === 'owed' ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi label="Owed to you" value={m.inr(summary.totalOwed)} sub={`${summary.openCount} open ${summary.openCount === 1 ? 'entry' : 'entries'}`} tone={summary.totalOwed > 0 ? undefined : 'good'} />
            <Kpi label="Overdue" value={m.inr(summary.overdueAmount)} sub={summary.overdueCount ? `${summary.overdueCount} past due date` : 'Nothing late'} tone={summary.overdueCount ? 'bad' : 'good'} />
            <Kpi label="Received so far" value={m.inr(summary.totalReceived)} sub={`of ${m.inr(summary.totalLent)} lent`} />
            <Kpi label="People" value={String(summary.people)} sub="you have lent to" />
          </div>

          {list.length === 0 ? (
            <GlassCard hover={false} className="mx-auto max-w-xl p-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                <HandCoins className="h-6 w-6" />
              </span>
              <h2 className="mt-4 section-title">No one owes you yet</h2>
              <p className="mt-1 text-sm text-text-secondary">Add a person and the amount. Record each payment as it comes back, and the balance updates by itself.</p>
              <Button className="mt-5" size="sm" magnetic={false} onClick={() => setDialog({ open: true, entry: blankEntry(today) })}>
                <Plus className="h-4 w-4" /> Add the first one
              </Button>
            </GlassCard>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {open.map(({ e }) => (
                  <PersonCard key={e.id} e={e} today={today} onEdit={() => setDialog({ open: true, entry: e })} onDelete={() => void remove(e)} onSave={save} onSplit={() => { setCalcFor(e.id); setTab('calc') }} />
                ))}
              </div>
              {settled.length > 0 && (
                <div>
                  <button type="button" onClick={() => setShowSettled((v) => !v)} className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text">
                    <CalendarClock className="h-3.5 w-3.5" /> {settled.length} settled {showSettled ? '— hide' : '— show'}
                  </button>
                  {showSettled && (
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {settled.map(({ e }) => (
                        <PersonCard key={e.id} e={e} today={today} onEdit={() => setDialog({ open: true, entry: e })} onDelete={() => void remove(e)} onSave={save} onSplit={() => { setCalcFor(e.id); setTab('calc') }} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <Calculator_
          entries={list}
          selectedId={calcFor}
          onSelect={setCalcFor}
          today={today}
          onSaveLoan={async (e, loan) => setEntries(await saveLending({ ...e, passThrough: loan }))}
        />
      )}

      <EntryDialog open={dialog.open} initial={dialog.entry} onClose={() => setDialog({ open: false, entry: null })} onSave={save} />
    </div>
  )
}
