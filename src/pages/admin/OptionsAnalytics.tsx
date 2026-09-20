import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, FileUp, RefreshCw, Trash2 } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/utils'
import { formatInr, formatSignedInr } from '@/lib/kite'
import {
  DEFAULT_CHARGE_RATES,
  analyze,
  buildInsights,
  buildRoundTrips,
  estimateCharges,
  mergeFills,
  parseOptionSymbol,
  parseTradebookCsv,
  type Analytics,
  type ChargeRates,
  type Fill,
  type RoundTrip,
  type Slice,
} from '@/lib/optionsAnalytics'
import { demoFills } from '@/lib/optionsDemo'

const STORAGE_KEY = 'options_fills_v1'
const PAGE = 25

const VIZ_CSS = `
.opt-viz{--s1:#3987e5;--s-ink:#c3c2b7}
:root[data-theme='light'] .opt-viz{--s1:#2a78d6}
`

type Range = 'all' | 'month' | '3m' | '6m' | '1y'
const RANGES: { id: Range; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'month', label: 'This month' },
  { id: '3m', label: '3 months' },
  { id: '6m', label: '6 months' },
  { id: '1y', label: '1 year' },
]

const tone = (n: number) => (n > 0 ? 'text-accent' : n < 0 ? 'text-error' : 'text-text-secondary')

function loadFills(): Fill[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Fill[]) : []
  } catch {
    return []
  }
}

function saveFills(fills: Fill[]) {
  try {
    if (fills.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(fills))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage full or blocked: the import just won't survive a reload.
  }
}

function rangeStart(range: Range, today: string): string {
  if (range === 'all') return ''
  const d = new Date(`${today}T00:00:00Z`)
  if (range === 'month') d.setUTCDate(1)
  else d.setUTCMonth(d.getUTCMonth() - (range === '3m' ? 3 : range === '6m' ? 6 : 12))
  return d.toISOString().slice(0, 10)
}

function fmtDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })
}

function contractLabel(symbol: string) {
  const m = parseOptionSymbol(symbol)
  return m ? `${m.underlying} ${m.strike} ${m.type}` : symbol
}

function heldLabel(min: number, days: number) {
  if (days > 0) return `${days + 1}d`
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`
}

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{children}</h2>
      {aside}
    </div>
  )
}

function Kpi({ label, value, sub, valueClassName }: { label: string; value: ReactNode; sub?: ReactNode; valueClassName?: string }) {
  return (
    <GlassCard hover={false} className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={cn('mt-1.5 whitespace-nowrap font-mono text-xl font-semibold text-text', valueClassName)}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-text-secondary">{sub}</p>}
    </GlassCard>
  )
}

function Money({ value, className }: { value: number; className?: string }) {
  const Icon = value < 0 ? ArrowDownRight : ArrowUpRight
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap font-mono', tone(value), className)}>
      {value !== 0 && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {formatSignedInr(value)}
    </span>
  )
}

function EquityCurve({ points, drawdown }: { points: Analytics['equity']; drawdown: Analytics['maxDrawdown'] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length === 0) return <p className="py-10 text-center text-sm text-text-secondary">No closed trades in this range.</p>
  const W = 720
  const H = 220
  const PX = 8
  const PT = 12
  const PB = 8
  const values = points.map((p) => p.cum)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const x = (i: number) => PX + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - PX * 2)
  const y = (v: number) => PT + ((max - v) / span) * (H - PT - PB)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.cum).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`
  const active = hover ?? points.length - 1
  const p = points[active]

  return (
    <div>
      <p className="mb-2 text-xs text-text-secondary">
        {fmtDate(p.date)} · cumulative net <Money value={p.cum} />
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-56 w-full touch-none"
        role="img"
        aria-label="Cumulative net profit and loss over time"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const frac = (e.clientX - rect.left) / rect.width
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(frac * (points.length - 1)))))
        }}
      >
        <line x1={PX} x2={W - PX} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-border" strokeDasharray="4 4" />
        <path d={area} fill="var(--s1)" opacity={0.12} />
        <path d={line} fill="none" stroke="var(--s1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <>
            <line x1={x(active)} x2={x(active)} y1={PT} y2={H - PB} stroke="currentColor" className="text-text-secondary/40" />
            <circle cx={x(active)} cy={y(p.cum)} r={4.5} fill="var(--s1)" stroke="var(--color-card)" strokeWidth={2} />
          </>
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-text-secondary">
        <span>{fmtDate(points[0].date)}</span>
        <span>{fmtDate(points[points.length - 1].date)}</span>
      </div>
      {drawdown.amount > 0 && (
        <p className="mt-2 text-xs text-text-secondary">
          Max drawdown <span className="font-mono font-semibold text-error">-{formatInr(drawdown.amount)}</span> ({fmtDate(drawdown.from)} → {fmtDate(drawdown.to)})
        </p>
      )}
    </div>
  )
}

function DailyBars({ days }: { days: Analytics['days'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = days.slice(-90)
  if (shown.length === 0) return <p className="py-10 text-center text-sm text-text-secondary">No trading days in this range.</p>
  const max = Math.max(1, ...shown.map((d) => Math.abs(d.net)))
  const d = hover !== null ? shown[hover] : null
  return (
    <div>
      <p className="mb-2 min-h-4 text-xs text-text-secondary">
        {d ? (
          <>
            {fmtDate(d.date)} · <Money value={d.net} /> net · {d.trades} trade{d.trades === 1 ? '' : 's'} · charges {formatInr(d.charges)}
          </>
        ) : (
          `Net P&L per day · last ${shown.length} trading day${shown.length === 1 ? '' : 's'}`
        )}
      </p>
      <div className="relative flex h-40 items-stretch gap-px" onMouseLeave={() => setHover(null)} role="img" aria-label="Daily net profit and loss">
        <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border" aria-hidden />
        {shown.map((day, i) => (
          <div key={day.date} className="relative flex-1" onMouseEnter={() => setHover(i)}>
            <div
              className={cn('absolute inset-x-px rounded-[2px] transition-opacity', day.net >= 0 ? 'bottom-1/2 bg-accent' : 'top-1/2 bg-error', hover !== null && hover !== i && 'opacity-40')}
              style={{ height: `${(Math.abs(day.net) / max) * 50}%`, minHeight: 2 }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function BreakdownCard({ title, note, slices }: { title: string; note?: string; slices: Slice[] }) {
  const max = Math.max(1, ...slices.map((s) => Math.abs(s.pnl)))
  return (
    <GlassCard hover={false} className="p-5">
      <SectionTitle aside={note && <span className="text-[11px] text-text-secondary">{note}</span>}>{title}</SectionTitle>
      {slices.length === 0 ? (
        <p className="text-sm text-text-secondary">Nothing to show yet.</p>
      ) : (
        <ul className="space-y-3">
          {slices.map((s) => (
            <li key={s.key} className="text-xs" title={`${s.key}: ${formatSignedInr(s.pnl)} over ${s.trades} trades, ${Math.round((s.wins / s.trades) * 100)}% wins`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-text">{s.key}</span>
                <Money value={s.pnl} />
              </div>
              <div className="relative mt-1 h-2">
                <span className="absolute inset-y-0 left-1/2 w-px bg-border" aria-hidden />
                <div
                  className={cn('absolute inset-y-0 rounded-full', s.pnl >= 0 ? 'bg-accent' : 'bg-error')}
                  style={s.pnl >= 0 ? { left: '50%', width: `${(Math.abs(s.pnl) / max) * 50}%` } : { right: '50%', width: `${(Math.abs(s.pnl) / max) * 50}%` }}
                />
              </div>
              <p className="mt-0.5 text-[11px] text-text-secondary">
                {s.trades} trade{s.trades === 1 ? '' : 's'} · {Math.round((s.wins / s.trades) * 100)}% wins
              </p>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}

function TripList({ title, trips }: { title: string; trips: RoundTrip[] }) {
  return (
    <GlassCard hover={false} className="p-5">
      <SectionTitle>{title}</SectionTitle>
      {trips.length === 0 ? (
        <p className="text-sm text-text-secondary">None in this range.</p>
      ) : (
        <ul>
          {trips.map((t) => (
            <li key={t.id + t.closeTs} className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 text-xs last:border-0">
              <div className="min-w-0">
                <p className="truncate font-mono font-semibold text-text">{contractLabel(t.symbol)}</p>
                <p className="mt-0.5 text-text-secondary">
                  {fmtDate(t.closeDate)} · {t.direction === 'LONG' ? 'Bought' : 'Sold'} {t.qty} @ {formatInr(t.entryPrice, 2)} → {formatInr(t.exitPrice, 2)}
                </p>
              </div>
              <Money value={t.pnl} />
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      data-cursor="hover"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs transition-colors',
        active ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:border-accent/40 hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

function ChargeInput({ label, value, onChange, step = '0.001' }: { label: string; value: number; onChange: (n: number) => void; step?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
      {label}
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
        className="rounded-md border border-border bg-surface-2 px-2 py-1.5 font-mono text-xs text-text outline-none focus:border-accent/50"
      />
    </label>
  )
}

export function OptionsAnalytics() {
  const [stored, setStored] = useState<Fill[]>(loadFills)
  const [demo, setDemo] = useState(false)
  const [range, setRange] = useState<Range>('all')
  const [rates, setRates] = useState<ChargeRates>(DEFAULT_CHARGE_RATES)
  const [tab, setTab] = useState<'trades' | 'orders'>('trades')
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all')
  const [shown, setShown] = useState(PAGE)
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const today = new Date().toISOString().slice(0, 10)
  const fills = useMemo(() => (demo ? demoFills() : stored), [demo, stored])

  const model = useMemo(() => {
    const from = rangeStart(range, today)
    const { trips, open } = buildRoundTrips(fills, today)
    const charges = estimateCharges(fills, rates)
    const inRange = (date: string) => !from || date >= from
    const t = trips.filter((x) => inRange(x.closeDate))
    return {
      trips: t,
      open,
      fills: fills.filter((f) => inRange(f.date)),
      analytics: analyze(t, charges.filter((c) => inRange(c.date))),
      expired: t.filter((x) => x.expired).length,
    }
  }, [fills, rates, range, today])

  const a = model.analytics
  const insights = useMemo(() => buildInsights(a), [a])

  const orders = useMemo(() => {
    const map = new Map<string, { key: string; ts: number; date: string; time: string; symbol: string; side: string; qty: number; value: number }>()
    for (const f of model.fills) {
      const key = f.orderId || f.id
      const o = map.get(key) ?? { key, ts: f.ts, date: f.date, time: f.time, symbol: f.symbol, side: f.side, qty: 0, value: 0 }
      o.qty += f.qty
      o.value += f.qty * f.price
      map.set(key, o)
    }
    return [...map.values()].sort((x, y) => y.ts - x.ts)
  }, [model.fills])

  const tripRows = useMemo(() => {
    const rows = [...model.trips].sort((x, y) => y.closeTs - x.closeTs)
    return filter === 'wins' ? rows.filter((r) => r.pnl > 0) : filter === 'losses' ? rows.filter((r) => r.pnl < 0) : rows
  }, [model.trips, filter])

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    let merged = stored
    let added = 0
    let ignored = 0
    for (const file of files) {
      const result = parseTradebookCsv(await file.text())
      if (result.error) {
        setMessage({ tone: 'bad', text: `${file.name}: ${result.error}` })
        return
      }
      const before = merged.length
      merged = mergeFills(merged, result.fills)
      added += merged.length - before
      ignored += result.ignoredRows
    }
    setStored(merged)
    saveFills(merged)
    setDemo(false)
    setShown(PAGE)
    setMessage({
      tone: 'good',
      text: `Added ${added} option trade${added === 1 ? '' : 's'} from ${files.length} file${files.length === 1 ? '' : 's'}${ignored ? ` · ${ignored} non-option row${ignored === 1 ? '' : 's'} ignored` : ''}.`,
    })
  }

  function clearAll() {
    setStored([])
    saveFills([])
    setDemo(false)
    setMessage(null)
  }

  const hasData = fills.length > 0
  const firstDate = fills[0]?.date
  const lastDate = fills.at(-1)?.date
  const setRate = (k: keyof ChargeRates) => (n: number) => setRates((r) => ({ ...r, [k]: n }))

  return (
    <div className="opt-viz mx-auto max-w-6xl space-y-5">
      <style>{VIZ_CSS}</style>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Options only</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text">Options trading analytics</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            {demo ? 'Showing sample trades — not your account.' : 'Where you win, where you leak, and what it costs — from your Zerodha Console tradebook.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input ref={fileRef} type="file" accept=".csv,text/csv" multiple className="hidden" onChange={handleFiles} aria-label="Upload tradebook CSV" />
          <button
            type="button"
            data-cursor="hover"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 font-semibold text-bg transition-opacity hover:opacity-90"
          >
            <FileUp className="h-3.5 w-3.5" />
            {stored.length ? 'Add more CSVs' : 'Import tradebook CSV'}
          </button>
          {(stored.length > 0 || demo) && (
            <button
              type="button"
              data-cursor="hover"
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-text-secondary transition-colors hover:border-error/40 hover:text-error"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {demo ? 'Exit preview' : 'Clear data'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <p role="status" className={cn('rounded-lg border px-3 py-2 text-xs', message.tone === 'good' ? 'border-accent/30 bg-accent/10 text-accent' : 'border-error/30 bg-error/10 text-error')}>
          {message.text}
        </p>
      )}

      {!hasData ? (
        <GlassCard hover={false} className="mx-auto max-w-2xl space-y-4 px-6 py-10">
          <h2 className="font-display text-xl font-semibold text-text">Import your options trade history</h2>
          <p className="text-sm text-text-secondary">
            Kite&apos;s API only returns today&apos;s orders, so past trades come from a Console export. Your file is read in this browser and kept on this device
            only — nothing is uploaded.
          </p>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text-secondary">
            <li>Open Zerodha Console → Reports → <strong className="text-text">Tradebook</strong>.</li>
            <li>Pick segment <strong className="text-text">F&amp;O</strong> and a date range (Console limits how long a range can be — download several if needed).</li>
            <li>Download as <strong className="text-text">CSV</strong>, then import every file here. Duplicates are skipped.</li>
          </ol>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              data-cursor="hover"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
            >
              <FileUp className="h-4 w-4" />
              Import tradebook CSV
            </button>
            <button
              type="button"
              data-cursor="hover"
              onClick={() => setDemo(true)}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
            >
              Preview with sample data
            </button>
          </div>
        </GlassCard>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {RANGES.map((r) => (
                <Chip key={r.id} active={range === r.id} onClick={() => { setRange(r.id); setShown(PAGE) }}>
                  {r.label}
                </Chip>
              ))}
            </div>
            <p className="text-xs text-text-secondary">
              {fills.length} fills · {fmtDate(firstDate!)} → {fmtDate(lastDate!)}
            </p>
          </div>

          {a.trades === 0 ? (
            <GlassCard hover={false} className="py-16 text-center text-sm text-text-secondary">
              No closed option trades in this range.
            </GlassCard>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Kpi label="Net P&L" value={<Money value={a.net} className="text-xl" />} sub="after est. charges" />
                <Kpi label="Gross P&L" value={<Money value={a.gross} className="text-xl" />} sub={`${a.trades} closed trades`} />
                <Kpi
                  label="Charges (est.)"
                  value={formatInr(a.charges)}
                  valueClassName="text-amber-500"
                  sub={a.gross > 0 ? `${Math.round((a.charges / a.gross) * 100)}% of gross profit` : 'brokerage, STT, GST…'}
                />
                <Kpi label="Win rate" value={`${a.winRate.toFixed(1)}%`} sub={`${a.wins} wins · ${a.losses} losses`} />
                <Kpi label="Profit factor" value={a.profitFactor === null ? '—' : a.profitFactor.toFixed(2)} sub="gross wins ÷ gross losses" />
                <Kpi
                  label="Avg win / loss"
                  value={<>{formatInr(a.avgWin)} <span className="text-text-secondary">/</span> {formatInr(a.avgLoss)}</>}
                  valueClassName="whitespace-normal text-lg"
                  sub={a.payoff === null ? undefined : `payoff ${a.payoff.toFixed(2)}`}
                />
              </div>

              {insights.length > 0 && (
                <GlassCard hover={false} className="p-5">
                  <SectionTitle>What the numbers say</SectionTitle>
                  <ul className="space-y-2">
                    {insights.map((i) => (
                      <li key={i.text} className="flex gap-2.5 text-sm text-text-secondary">
                        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', i.tone === 'good' ? 'bg-accent' : i.tone === 'bad' ? 'bg-error' : 'bg-text-secondary/60')} aria-hidden />
                        <span>{i.text}</span>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              )}

              <div className="grid gap-5 lg:grid-cols-2">
                <GlassCard hover={false} className="p-5">
                  <SectionTitle>Cumulative net P&amp;L</SectionTitle>
                  <EquityCurve points={a.equity} drawdown={a.maxDrawdown} />
                </GlassCard>
                <GlassCard hover={false} className="p-5">
                  <SectionTitle>Daily net P&amp;L</SectionTitle>
                  <DailyBars days={a.days} />
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-text-secondary">
                    <p>
                      Best day{' '}
                      {a.bestDay && (
                        <>
                          <Money value={a.bestDay.net} /> <span className="block text-[11px]">{fmtDate(a.bestDay.date)}</span>
                        </>
                      )}
                    </p>
                    <p>
                      Worst day{' '}
                      {a.worstDay && (
                        <>
                          <Money value={a.worstDay.net} /> <span className="block text-[11px]">{fmtDate(a.worstDay.date)}</span>
                        </>
                      )}
                    </p>
                    <p>Longest win streak <span className="font-mono font-semibold text-text">{a.maxWinStreak}</span></p>
                    <p>Longest loss streak <span className="font-mono font-semibold text-text">{a.maxLossStreak}</span></p>
                  </div>
                </GlassCard>
              </div>

              <div>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Where you win and lose <span className="font-normal normal-case">· gross P&amp;L before charges</span></h2>
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  <BreakdownCard title="By index / stock" slices={a.breakdowns.underlying} />
                  <BreakdownCard title="Calls vs puts" slices={a.breakdowns.type} />
                  <BreakdownCard title="Buying vs selling" slices={a.breakdowns.direction} />
                  <BreakdownCard title="By weekday" note="day of entry" slices={a.breakdowns.weekday} />
                  <BreakdownCard title="By entry time" note="hour of entry (IST)" slices={a.breakdowns.entryHour} />
                  <BreakdownCard title="By days to expiry" note="monthly = approx." slices={a.breakdowns.dte} />
                  <BreakdownCard title="By holding time" slices={a.breakdowns.hold} />
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <TripList title="Top 5 winners" trips={a.topWins} />
                <TripList title="Top 5 losers" trips={a.topLosses} />
              </div>

              <GlassCard hover={false} className="p-5">
                <SectionTitle aside={<span className="text-xs font-mono text-text">{formatInr(a.charges)}</span>}>Charges (estimated)</SectionTitle>
                <ul className="grid gap-x-8 gap-y-2 text-xs sm:grid-cols-2">
                  {(
                    [
                      ['Brokerage', a.chargeParts.brokerage],
                      ['STT (on sells)', a.chargeParts.stt],
                      ['Exchange transaction', a.chargeParts.exchange],
                      ['GST', a.chargeParts.gst],
                      ['SEBI fees', a.chargeParts.sebi],
                      ['Stamp duty (on buys)', a.chargeParts.stamp],
                    ] as const
                  ).map(([label, value]) => (
                    <li key={label} className="flex items-center justify-between gap-3">
                      <span className="text-text-secondary">{label}</span>
                      <span className="font-mono text-text">{formatInr(value, 2)}</span>
                    </li>
                  ))}
                </ul>
                <details className="mt-4 rounded-xl border border-border bg-surface-2 p-3 text-xs text-text-secondary">
                  <summary className="cursor-pointer font-medium text-text">Charge assumptions</summary>
                  <p className="mt-2">
                    These are estimates from a standard Zerodha options fee schedule. Rates change (STT especially) — match them to your contract notes.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <ChargeInput label="Brokerage / order (₹)" value={rates.brokeragePerOrder} onChange={setRate('brokeragePerOrder')} step="1" />
                    <ChargeInput label="Brokerage cap (% turnover)" value={rates.brokeragePct} onChange={setRate('brokeragePct')} />
                    <ChargeInput label="STT on sell (%)" value={rates.sttSellPct} onChange={setRate('sttSellPct')} />
                    <ChargeInput label="Exchange (%)" value={rates.exchangePct} onChange={setRate('exchangePct')} />
                    <ChargeInput label="SEBI (₹ / crore)" value={rates.sebiPerCrore} onChange={setRate('sebiPerCrore')} step="1" />
                    <ChargeInput label="GST (%)" value={rates.gstPct} onChange={setRate('gstPct')} step="1" />
                    <ChargeInput label="Stamp on buy (%)" value={rates.stampBuyPct} onChange={setRate('stampBuyPct')} />
                    <button
                      type="button"
                      data-cursor="hover"
                      onClick={() => setRates(DEFAULT_CHARGE_RATES)}
                      className="self-end rounded-md border border-border px-2 py-1.5 text-text-secondary transition-colors hover:text-text"
                    >
                      Reset
                    </button>
                  </div>
                </details>
              </GlassCard>

              <GlassCard hover={false} className="p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-2">
                    <Chip active={tab === 'trades'} onClick={() => { setTab('trades'); setShown(PAGE) }}>
                      Trades ({model.trips.length})
                    </Chip>
                    <Chip active={tab === 'orders'} onClick={() => { setTab('orders'); setShown(PAGE) }}>
                      Orders ({orders.length})
                    </Chip>
                  </div>
                  {tab === 'trades' && (
                    <div className="flex gap-2">
                      {(['all', 'wins', 'losses'] as const).map((f) => (
                        <Chip key={f} active={filter === f} onClick={() => { setFilter(f); setShown(PAGE) }}>
                          {f === 'all' ? 'All' : f === 'wins' ? 'Winners' : 'Losers'}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  {tab === 'trades' ? (
                    <table className="w-full min-w-[640px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-secondary">
                          <th className="py-2 pr-3 font-medium">Closed</th>
                          <th className="py-2 pr-3 font-medium">Contract</th>
                          <th className="py-2 pr-3 font-medium">Side</th>
                          <th className="py-2 pr-3 text-right font-medium">Qty</th>
                          <th className="py-2 pr-3 text-right font-medium">Entry</th>
                          <th className="py-2 pr-3 text-right font-medium">Exit</th>
                          <th className="py-2 pr-3 text-right font-medium">Held</th>
                          <th className="py-2 text-right font-medium">P&amp;L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tripRows.slice(0, shown).map((t) => (
                          <tr key={t.id + t.closeTs} className="border-b border-border/60 transition-colors hover:bg-surface-3">
                            <td className="py-2.5 pr-3 text-text-secondary">{fmtDate(t.closeDate)}</td>
                            <td className="py-2.5 pr-3 font-mono font-semibold text-text">{contractLabel(t.symbol)}</td>
                            <td className="py-2.5 pr-3 text-text-secondary">{t.direction === 'LONG' ? 'Bought' : 'Sold'}</td>
                            <td className="py-2.5 pr-3 text-right font-mono text-text-secondary">{t.qty}</td>
                            <td className="py-2.5 pr-3 text-right font-mono text-text">{formatInr(t.entryPrice, 2)}</td>
                            <td className="py-2.5 pr-3 text-right font-mono text-text">{t.expired ? 'expired' : formatInr(t.exitPrice, 2)}</td>
                            <td className="py-2.5 pr-3 text-right font-mono text-text-secondary">{heldLabel(t.holdMin, Math.round((Date.parse(t.closeDate) - Date.parse(t.openDate)) / 86_400_000))}</td>
                            <td className="py-2.5 text-right"><Money value={t.pnl} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-secondary">
                          <th className="py-2 pr-3 font-medium">Executed</th>
                          <th className="py-2 pr-3 font-medium">Contract</th>
                          <th className="py-2 pr-3 font-medium">Side</th>
                          <th className="py-2 pr-3 text-right font-medium">Qty</th>
                          <th className="py-2 pr-3 text-right font-medium">Avg price</th>
                          <th className="py-2 text-right font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.slice(0, shown).map((o) => (
                          <tr key={o.key} className="border-b border-border/60 transition-colors hover:bg-surface-3">
                            <td className="py-2.5 pr-3 text-text-secondary">{fmtDate(o.date)} · {o.time.slice(0, 5)}</td>
                            <td className="py-2.5 pr-3 font-mono font-semibold text-text">{contractLabel(o.symbol)}</td>
                            <td className={cn('py-2.5 pr-3 font-semibold', o.side === 'BUY' ? 'text-accent' : 'text-error')}>{o.side}</td>
                            <td className="py-2.5 pr-3 text-right font-mono text-text-secondary">{o.qty}</td>
                            <td className="py-2.5 pr-3 text-right font-mono text-text">{formatInr(o.value / o.qty, 2)}</td>
                            <td className="py-2.5 text-right font-mono text-text-secondary">{formatInr(o.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {shown < (tab === 'trades' ? tripRows.length : orders.length) && (
                  <button
                    type="button"
                    data-cursor="hover"
                    onClick={() => setShown((n) => n + PAGE)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Show more
                  </button>
                )}
              </GlassCard>

              <div className="space-y-1 text-center text-[11px] leading-relaxed text-text-secondary/70">
                <p>
                  A trade runs from flat to flat on one contract (scaling in or out counts once) and is matched first-in-first-out. Options still open after expiry
                  are treated as expired at ₹0
                  {model.expired ? ` (${model.expired} such trade${model.expired === 1 ? '' : 's'} here)` : ''}; in-the-money settlement isn&apos;t in the tradebook.
                  {model.open.length > 0 && ` ${model.open.length} contract${model.open.length === 1 ? ' is' : 's are'} still open and not counted.`}
                </p>
                <p>Charges are estimates. This is analysis of past trades, not investment advice.</p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
