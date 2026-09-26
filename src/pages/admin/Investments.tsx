import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { HideNumbersButton } from '@/components/journal/chrome'
import { ReportMenu } from '@/components/viz/ReportMenu'
import { cn } from '@/lib/utils'
import { useMoney } from '@/lib/privacy'
import { fetchStatements, fetchLoanDocs } from '@/lib/statementsApi'
import type { Txn } from '@/lib/statements'
import { KiteTokenExpiredError, clearKiteSession, fetchKiteSnapshot, getKiteSession, holdingRows } from '@/lib/kite'
import { HOLDINGS, SNAPSHOT } from '@/lib/portfolio'
import { compareBenchmark, returnTotals, rowsFromKite, rowsFromStatic, type ReturnRow } from '@/lib/returns'
import { detectSips } from '@/lib/sips'
import { LTCG_EXEMPTION, LTCG_RATE, STCG_RATE, parseCapitalGains, realisedXirr, summarizeByFy, taxableGains } from '@/lib/capitalGains'
import { LIMIT_80D_PARENTS_SENIOR, detectDeductions } from '@/lib/deductions'
import { buildReminders, type CustomReminder } from '@/lib/reminders'
import { addReminder, deleteReminder, fetchCapitalGains, fetchReminders, saveCapitalGains, type SavedFySummary } from '@/lib/investApi'
import { readTradeFile } from '@/lib/tradeImport'
import { fyOf } from '@/lib/tax'
import { buildLoans } from '@/lib/loans'
import type { ReportDoc } from '@/lib/report'

const today = () => new Date().toISOString().slice(0, 10)
const tone = (n: number | null) => (n === null || n === 0 ? 'text-text-secondary' : n > 0 ? 'text-positive' : 'text-error')
const dateLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const NA = 'n/a'

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <GlassCard hover={false} className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="label-caps">{title}</h2>
        {aside}
      </div>
      {children}
    </GlassCard>
  )
}

function Stat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="label-caps">{label}</p>
      <p className="mt-0.5 truncate font-mono text-base font-semibold text-text">{children}</p>
      {sub && <p className="mt-0.5 text-2xs text-text-secondary">{sub}</p>}
    </div>
  )
}

const Note = ({ children }: { children: ReactNode }) => <p className="mt-3 text-2xs leading-relaxed text-text-secondary">{children}</p>

// ---------- Portfolio returns ----------

function Returns({ rows, source, error }: { rows: ReturnRow[]; source: string; error: string | null }) {
  const m = useMoney()
  const isStatic = source === 'static'
  const t = useMemo(() => returnTotals(rows, isStatic ? { pnl: SNAPSHOT.todayPnl, pct: SNAPSHOT.todayPnlPct } : undefined), [rows, isStatic])
  const sorted = useMemo(() => [...rows].sort((a, b) => b.value - a.value), [rows])
  const bench = compareBenchmark(t.gainPct, null)
  const pct = (n: number | null) => (n === null ? NA : m.hidden ? m.pct(n) : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`)
  return (
    <Card title="Portfolio returns" aside={<span className="rounded-full border border-border px-2.5 py-1 text-2xs text-text-secondary">{isStatic ? `Static snapshot, ${SNAPSHOT.label}` : 'Live from Zerodha'}</span>}>
      {error && <p role="alert" className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label="Invested">{t.invested === null ? NA : m.inr(t.invested)}</Stat>
        <Stat label="Current value">{m.inr(t.value)}</Stat>
        <Stat label="Gain" sub={pct(t.gainPct)}>
          <span className={tone(t.gain)}>{t.gain === null ? NA : m.signed(t.gain)}</span>
        </Stat>
        <Stat label="Day change" sub={pct(t.dayPct)}>
          <span className={tone(t.dayPnl)}>{t.dayPnl === null ? NA : m.signed(t.dayPnl)}</span>
        </Stat>
        <Stat label="XIRR" sub="needs buy dates">{NA}</Stat>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left label-caps">
              <th className="py-1.5 pr-3 font-medium">Holding</th>
              <th className="px-2 text-right font-medium">Invested</th>
              <th className="px-2 text-right font-medium">Value</th>
              <th className="px-2 text-right font-medium">Gain</th>
              <th className="px-2 text-right font-medium">Gain %</th>
              <th className="pl-2 text-right font-medium">Day</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.symbol} className="border-t border-border/60">
                <td className="py-1.5 pr-3 font-medium text-text">{r.symbol}</td>
                <td className="px-2 text-right font-mono text-text-secondary">{r.invested === null ? NA : m.inr(r.invested)}</td>
                <td className="px-2 text-right font-mono text-text">{m.inr(r.value)}</td>
                <td className={cn('px-2 text-right font-mono', tone(r.gain))}>{r.gain === null ? NA : m.signed(r.gain)}</td>
                <td className={cn('px-2 text-right font-mono', tone(r.gainPct))}>{pct(r.gainPct)}</td>
                <td className={cn('pl-2 text-right font-mono', tone(r.dayPnl))}>{r.dayPnl === null ? NA : m.signed(r.dayPnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>
        {isStatic
          ? 'This is the saved snapshot, which holds only current values, so cost, gain and % gain are not available. Connect Zerodha (Zerodha page) to see them live.'
          : 'Kite reports average buy price but not buy dates, so per-holding XIRR cannot be worked out; the realised XIRR under Capital gains uses the dated sales you import.'}
      </Note>
      <div className="mt-3 rounded-xl border border-border/60 bg-surface-2/40 px-3.5 py-3">
        <p className="label-caps">Versus Nifty 50</p>
        <p className="mt-1 text-xs text-text-secondary">
          {bench.available ? '' : 'Unavailable. The app has no Nifty 50 price feed (live prices cover Bitcoin, gold, US30 and USD/INR only) and holdings have no buy dates, so a same-period comparison would be invented. It needs a dated Nifty series and dated purchases.'}
        </p>
      </div>
    </Card>
  )
}

// ---------- SIPs ----------

function Sips({ txns }: { txns: Txn[] }) {
  const m = useMoney()
  const sips = useMemo(() => detectSips(txns, today()), [txns])
  return (
    <Card title="SIP tracker">
      {!sips.length ? (
        <p className="text-xs text-text-secondary">No monthly mutual-fund debits found in your bank statements (looks for NSE Clearing MFSS, Zerodha Coin, BSE StAR MF, fund-house names and "SIP", repeating in at least 3 months).</p>
      ) : (
        <div className="space-y-2.5">
          {sips.map((s) => (
            <div key={s.name} className="rounded-xl border border-border/60 bg-surface-2/40 px-3.5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-text">
                  {s.name} <span className={cn('ml-1.5 rounded-full px-2 py-0.5 text-2xs', s.active ? 'bg-positive/10 text-positive' : 'bg-error/10 text-error')}>{s.active ? 'Active' : 'Stopped'}</span>
                </p>
                <p className="font-mono text-sm font-semibold text-text">{m.inr(s.total)}</p>
              </div>
              <p className="mt-1 text-2xs text-text-secondary">
                {s.monthsActive} months, about {m.inr(s.avgAmount)} a month, last {dateLabel(s.lastDate)}
                {s.active && ` · next expected ${dateLabel(s.nextExpected)}`}
              </p>
              {s.missedMonths.length > 0 && <p className="mt-1 text-2xs text-warning">Missed: {s.missedMonths.slice(-8).map(monthLabel).join(', ')}</p>}
            </div>
          ))}
          <p className="text-2xs text-text-secondary">Total across SIPs: {m.inr(sips.reduce((s, x) => s + x.total, 0))}. Detected from bank narrations, so a SIP paid from another account or by card is not seen.</p>
        </div>
      )}
    </Card>
  )
}

// ---------- Capital gains ----------

function CapitalGains() {
  const m = useMoney()
  const [saved, setSaved] = useState<Record<string, SavedFySummary>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [xirrs, setXirrs] = useState<Record<string, number | null>>({})
  const [fy, setFy] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchCapitalGains()
      .then(setSaved)
      .catch(() => setMsg({ ok: false, text: 'Could not load saved summaries.' }))
  }, [])

  const years = useMemo(() => Object.values(saved).sort((a, b) => b.fy.localeCompare(a.fy)), [saved])
  const current = years.find((y) => y.fy === fy) ?? years[0]

  const onFile = async (file: File) => {
    setBusy(true)
    setMsg(null)
    try {
      const parsed = parseCapitalGains(await readTradeFile(file))
      if (parsed.problems.length && !parsed.rows.length) throw new Error(parsed.problems[0])
      const summaries = summarizeByFy(parsed.rows)
      for (const s of summaries) await saveCapitalGains(s)
      setSaved((prev) => ({ ...prev, ...Object.fromEntries(summaries.map((s) => [s.fy, s])) }))
      setXirrs((prev) => ({ ...prev, ...Object.fromEntries(summaries.map((s) => [s.fy, realisedXirr(parsed.rows.filter((r) => fyOf(r.exit) === s.fy))])) }))
      setFy(summaries[0]?.fy ?? null)
      setMsg({ ok: true, text: `Read ${parsed.rows.length} sales across ${summaries.map((s) => s.fy).join(', ')}${parsed.skipped ? `; skipped ${parsed.skipped} F&O rows` : ''}.` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not read that file.' })
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const tax = current ? taxableGains(current) : null
  const report = (): ReportDoc => {
    const c = current!
    const t = tax!
    const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
    return {
      title: `Capital gains, FY ${c.fy}`,
      subtitle: 'Listed equity and equity mutual funds, from the imported Zerodha Tax P&L',
      sections: [
        { title: 'Realised gains', kpis: [{ label: 'Intraday', value: inr(c.intraday), note: `${c.intradayTrades} trades`, tone: c.intraday >= 0 ? 'good' : 'bad' }, { label: 'Short-term', value: inr(c.stcg), note: `${c.stcgTrades} trades`, tone: c.stcg >= 0 ? 'good' : 'bad' }, { label: 'Long-term', value: inr(c.ltcg), note: `${c.ltcgTrades} trades`, tone: c.ltcg >= 0 ? 'good' : 'bad' }] },
        { title: 'Estimated tax', note: `Short-term ${STCG_RATE * 100}%, long-term ${LTCG_RATE * 100}% above ${inr(LTCG_EXEMPTION)} exemption. Intraday is business income at your slab rate.`, table: { columns: ['Item', 'Amount'], rows: [['Short-term after set-off', inr(t.stcgAfterSetOff)], ['Long-term after set-off', inr(t.ltcgAfterSetOff)], ['Exemption used', inr(t.exemptionUsed)], ['Taxable long-term', inr(t.ltcgTaxable)], ['STCG tax', inr(t.stcgTax)], ['LTCG tax', inr(t.ltcgTax)], ['Total estimated tax (before cess)', inr(t.totalTax)]], rightAlign: [1] } },
      ],
    }
  }

  return (
    <Card
      title="Capital gains"
      aside={
        <div className="flex items-center gap-2">
          <input ref={input} type="file" accept=".xlsx,.csv,.html,.htm" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Import Tax P&L
          </button>
          {current && (
            <ReportMenu
              filename={`capital-gains-${current.fy}`}
              report={report}
              csv={() => ({ filename: `capital-gains-${current.fy}`, columns: ['FY', 'Intraday', 'Short-term', 'Long-term', 'Taxable LTCG', 'STCG tax', 'LTCG tax'], rows: [[current.fy, current.intraday, current.stcg, current.ltcg, tax!.ltcgTaxable, tax!.stcgTax, tax!.ltcgTax]] })}
            />
          )}
        </div>
      }
    >
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={cn('mb-3 rounded-lg border px-3 py-2 text-xs', msg.ok ? 'border-positive/30 bg-positive/10 text-positive' : 'border-error/30 bg-error/10 text-error')}>{msg.text}</p>}
      {!current || !tax ? (
        <p className="text-xs text-text-secondary">Import Zerodha's Tax P&L (Console, Reports, Tax P&L, download .xlsx) to see intraday, short-term and long-term gains per financial year. Only the totals are saved, not the trades.</p>
      ) : (
        <>
          {years.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {years.map((y) => (
                <button key={y.fy} type="button" onClick={() => setFy(y.fy)} className={cn('rounded-full border px-2.5 py-1 text-2xs', y.fy === current.fy ? 'border-accent/50 text-text' : 'border-border text-text-secondary')}>
                  FY {y.fy}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Intraday" sub={`${current.intradayTrades} trades`}><span className={tone(current.intraday)}>{m.signed(current.intraday)}</span></Stat>
            <Stat label="Short-term" sub={`${current.stcgTrades} trades`}><span className={tone(current.stcg)}>{m.signed(current.stcg)}</span></Stat>
            <Stat label="Long-term" sub={`${current.ltcgTrades} trades`}><span className={tone(current.ltcg)}>{m.signed(current.ltcg)}</span></Stat>
            <Stat label="Realised XIRR" sub="this import only">{xirrs[current.fy] == null ? NA : m.pct(xirrs[current.fy]!)}</Stat>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl border border-border/60 bg-surface-2/40 p-3.5 sm:grid-cols-4">
            <Stat label={`LTCG over ${m.inr(LTCG_EXEMPTION)}`}>{m.inr(tax.ltcgTaxable)}</Stat>
            <Stat label={`STCG tax ${STCG_RATE * 100}%`}>{m.inr(tax.stcgTax)}</Stat>
            <Stat label={`LTCG tax ${LTCG_RATE * 100}%`}>{m.inr(tax.ltcgTax)}</Stat>
            <Stat label="Estimated tax" sub="before cess">{m.inr(tax.totalTax)}</Stat>
          </div>
          <Note>Short-term loss is set off against long-term gain. Intraday is business income taxed at your slab, so no flat rate is applied. Rates and the exemption are the current rules for listed equity and equity funds; FY 2024-25 sales before 23 Jul 2024 were taxed at 15% / 10% / ₹1 lakh, and debt funds are not separated. Check against your broker's report before filing.</Note>
        </>
      )}
    </Card>
  )
}

// ---------- Deductions ----------

function Deductions({ txns, homeLoanByFy }: { txns: Txn[]; homeLoanByFy: (fy: string) => number }) {
  const m = useMoney()
  const fys = useMemo(() => [...new Set(txns.map((t) => fyOf(t.date)))].sort().reverse(), [txns])
  const [fy, setFy] = useState<string | null>(null)
  const active = fy ?? fys[0]
  const sections = useMemo(() => (active ? detectDeductions(txns, active, { homeLoanPrincipal: homeLoanByFy(active) }) : []), [txns, active, homeLoanByFy])
  return (
    <Card title="Tax savings (old regime)" aside={fys.length > 1 && <select value={active} onChange={(e) => setFy(e.target.value)} className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-text">{fys.map((f) => <option key={f} value={f}>FY {f}</option>)}</select>}>
      {!active ? (
        <p className="text-xs text-text-secondary">Upload bank statements to scan for deductions.</p>
      ) : (
        <div className="space-y-3">
          {sections.map((s) => (
            <div key={s.section}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-text">{s.label}</span>
                <span className="font-mono text-text-secondary">{m.inr(s.counted)} of {m.inr(s.limit)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (s.counted / s.limit) * 100)}%` }} /></div>
              <p className="mt-1 text-2xs text-text-secondary">
                {s.lines.length ? s.lines.map((l) => `${l.label} ${m.inr(l.amount)}`).join(' · ') : 'Nothing detected'} · headroom {m.inr(s.headroom)}
              </p>
            </div>
          ))}
        </div>
      )}
      <Note>Detected from bank statement text only, so verify with proofs. Employer-deducted PF/NPS, premiums paid by card or by a parent, and anything not in the bank narration are not seen. 80D shows the self and family limit; parents add up to {m.inr(LIMIT_80D_PARENTS_SENIOR)} more if senior. These deductions are not available under the new regime.</Note>
    </Card>
  )
}

// ---------- Reminders ----------

function ComingUp({ txns, ready }: { txns: Txn[]; ready: boolean }) {
  const [custom, setCustom] = useState<CustomReminder[]>([])
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    fetchReminders().then(setCustom).catch(() => setErr('Could not load your reminders.'))
  }, [])
  const list = useMemo(() => (ready ? buildReminders(txns, today(), custom) : buildReminders([], today(), custom)).filter((r) => r.date >= today()).slice(0, 8), [txns, custom, ready])
  const add = async () => {
    if (!title.trim() || !date) return
    try {
      const r = await addReminder({ title: title.trim(), date })
      setCustom((c) => [...c, r])
      setTitle('')
      setDate('')
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add that.')
    }
  }
  const remove = async (id: string) => {
    try {
      await deleteReminder(id)
      setCustom((c) => c.filter((x) => `c-${x.id}` !== id && x.id !== id))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not remove that.')
    }
  }
  return (
    <Card title="Coming up" aside={<CalendarClock className="h-4 w-4 text-text-secondary" />}>
      {err && <p role="alert" className="mb-2 text-xs text-error">{err}</p>}
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 text-xs">
            <div className="min-w-0">
              <p className="font-medium text-text">{r.title}</p>
              <p className="text-2xs text-text-secondary">{r.detail}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-2xs text-text-secondary">{dateLabel(r.date)}</span>
              {r.kind === 'custom' && <button type="button" aria-label={`Remove ${r.title}`} onClick={() => remove(r.id)} className="text-text-secondary hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a reminder, e.g. FD matures" maxLength={120} className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Reminder date" className="rounded-lg border border-border bg-surface-2 px-2 py-2 text-xs text-text" />
        <button type="button" onClick={add} disabled={!title.trim() || !date} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-xs text-text-secondary hover:border-accent/40 hover:text-text disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Add</button>
      </div>
      <Note>Insurance renewals are predicted from yearly premium debits. FD and RD maturities are not in bank statements, so add them here.</Note>
    </Card>
  )
}

// ---------- Page ----------

export function Investments() {
  const [txns, setTxns] = useState<Txn[] | null>(null)
  const [stmtError, setStmtError] = useState<string | null>(null)
  const [rows, setRows] = useState<ReturnRow[]>(() => rowsFromStatic(HOLDINGS))
  const [source, setSource] = useState<'static' | 'live'>('static')
  const [holdErr, setHoldErr] = useState<string | null>(null)
  const [loans, setLoans] = useState<ReturnType<typeof buildLoans>>([])

  const session = getKiteSession()
  const loadLive = useCallback(async () => {
    if (!session) return
    try {
      const snap = await fetchKiteSnapshot(session.accessToken)
      const live = holdingRows(snap.holdings)
      if (live.length) {
        setRows(rowsFromKite(live))
        setSource('live')
      }
    } catch (e) {
      if (e instanceof KiteTokenExpiredError) clearKiteSession()
      setHoldErr(`Showing the saved snapshot: ${e instanceof Error ? e.message : 'live holdings unavailable'}`)
    }
  }, [session])
  useEffect(() => {
    loadLive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchStatements('bank')
      .then((d) => !cancelled && setTxns(d.transactions))
      .catch((e) => !cancelled && (setStmtError(e instanceof Error ? e.message : 'Could not load your bank statements.'), setTxns([])))
    fetchLoanDocs()
      .then((d) => !cancelled && setLoans(buildLoans(d.statements)))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const homeLoanByFy = useCallback(
    (fy: string) =>
      loans
        .filter((l) => /home|housing/i.test(l.label))
        .reduce((s, l) => s + l.schedule.filter((r) => r.status === 'paid' && fyOf(r.date) === fy).reduce((a, r) => a + r.principal, 0), 0),
    [loans],
  )

  const list = txns ?? []
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Investments</h1>
          <p className="page-lede">Returns, SIPs, capital gains, tax savings and reminders. {!session && <Link to="/admin/zerodha" className="text-accent hover:underline">Connect Zerodha</Link>}{!session && ' for live holdings.'}</p>
        </div>
        <HideNumbersButton />
      </div>
      {stmtError && <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{stmtError}</p>}
      <Returns rows={rows} source={source} error={holdErr} />
      <div className="grid gap-4 lg:grid-cols-2">
        {txns === null ? <GlassCard hover={false} className="flex items-center justify-center p-8 lg:col-span-2"><Loader2 className="h-5 w-5 animate-spin text-text-secondary" /></GlassCard> : <Sips txns={list} />}
        <ComingUp txns={list} ready={txns !== null} />
      </div>
      <CapitalGains />
      {txns !== null && <Deductions txns={list} homeLoanByFy={homeLoanByFy} />}
    </div>
  )
}
