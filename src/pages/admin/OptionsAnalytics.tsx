import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
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
  type Analytics,
  type ChargeRates,
  type Fill,
  type RoundTrip,
  type Slice,
} from '@/lib/optionsAnalytics'
import { demoFills } from '@/lib/optionsDemo'
import { clearStoredFills, fetchStoredBrokers, fetchStoredFills, saveFills } from '@/lib/optionsStore'
import { BROKERS, SAMPLE_BROKER, brokerHint, brokerLabel, slugifyBroker } from '@/lib/brokers'
import { ReportMenu } from '@/components/viz/ReportMenu'
import { FitValue } from '@/components/viz/FitValue'
import { optionsReport, optionsTradesCsv } from '@/lib/moduleReports'
import { FIELDS, analyseRows, autoMapping, cellText, mappingProblems, readTradeFile, rowsToFills, type Cell, type Mapping } from '@/lib/tradeImport'

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

// Older versions kept imports in this browser only; they're uploaded to the vault once, then removed.
function takeLegacyFills(): Fill[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Fill[]) : []
  } catch {
    return []
  }
}

function dropLegacyFills() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
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

function Kpi({ label, value, fit, sub, valueClassName }: { label: string; value: ReactNode; fit: string; sub?: ReactNode; valueClassName?: string }) {
  return (
    <GlassCard hover={false} className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <FitValue max={20} text={fit} className={cn('mt-1.5 whitespace-nowrap font-mono font-semibold leading-tight text-text', valueClassName)}>
        {value}
      </FitValue>
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

interface Acc {
  fills: Fill[]
  ignored: number
  files: number
  samples: string[]
  notes: string[]
}

interface Pending {
  brokerId: string
  fileName: string
  rows: Cell[][]
  headerIdx: number
  mapping: Mapping
  rest: File[]
  acc: Acc
}

const RATES_KEY = 'options_rates_v1'

function loadRates(): Record<string, ChargeRates> {
  try {
    return JSON.parse(localStorage.getItem(RATES_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function MappingCard({ pending, onChange, onConfirm, onSkip }: { pending: Pending; onChange: (p: Pending) => void; onConfirm: () => void; onSkip: () => void }) {
  const header = pending.rows[pending.headerIdx] ?? []
  const problems = mappingProblems(pending.mapping)
  const preview = pending.rows.slice(pending.headerIdx + 1, pending.headerIdx + 4)
  const setHeaderRow = (idx: number) => {
    const i = Math.min(Math.max(idx, 0), Math.max(pending.rows.length - 2, 0))
    onChange({ ...pending, headerIdx: i, mapping: autoMapping(pending.rows[i] ?? [], pending.rows.slice(i + 1)) })
  }
  return (
    <GlassCard hover={false} className="space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-text">Match the columns in {pending.fileName}</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Couldn&apos;t recognise every column automatically. Pick which column holds each value; this mapping applies to this file only.
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        Header is on row
        <input
          type="number"
          min={1}
          value={pending.headerIdx + 1}
          onChange={(e) => setHeaderRow((parseInt(e.target.value, 10) || 1) - 1)}
          className="w-16 rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs text-text outline-none focus:border-accent/50"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-[11px] text-text-secondary">
            {f.label}
            <select
              value={pending.mapping[f.key] ?? ''}
              onChange={(e) => {
                const next = { ...pending.mapping }
                if (e.target.value === '') delete next[f.key]
                else next[f.key] = Number(e.target.value)
                onChange({ ...pending, mapping: next })
              }}
              className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-text outline-none focus:border-accent/50"
            >
              <option value="" className="bg-card">— not in file —</option>
              {header.map((h, i) => (
                <option key={i} value={i} className="bg-card">
                  {cellText(h) || `Column ${i + 1}`}
                </option>
              ))}
            </select>
            {f.hint && <span className="text-[10px] text-text-secondary/70">{f.hint}</span>}
          </label>
        ))}
      </div>
      {preview.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-surface-2 text-text-secondary">
                {header.map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">{cellText(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, ri) => (
                <tr key={ri} className="border-t border-border/60">
                  {header.map((_, i) => (
                    <td key={i} className="whitespace-nowrap px-2 py-1.5 font-mono text-text-secondary">{cellText(r[i])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {problems.length > 0 && <p className="text-xs text-error">Still needed: {problems.join(', ')}.</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          data-cursor="hover"
          disabled={problems.length > 0}
          onClick={onConfirm}
          className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Import with this mapping
        </button>
        <button
          type="button"
          data-cursor="hover"
          onClick={onSkip}
          className="rounded-full border border-border px-5 py-2 text-sm text-text-secondary transition-colors hover:text-text"
        >
          Skip this file
        </button>
      </div>
    </GlassCard>
  )
}

export function OptionsAnalytics() {
  const [data, setData] = useState<Record<string, Fill[]>>({})
  const [active, setActive] = useState('all')
  const [extraBrokers, setExtraBrokers] = useState<string[]>([])
  const [addingBroker, setAddingBroker] = useState(false)
  const [newBroker, setNewBroker] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [demo, setDemo] = useState(false)
  const [range, setRange] = useState<Range>('all')
  const [ratesByBroker, setRatesByBroker] = useState<Record<string, ChargeRates>>(loadRates)
  const [tab, setTab] = useState<'trades' | 'orders'>('trades')
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all')
  const [shown, setShown] = useState(PAGE)
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ids = await fetchStoredBrokers()
        const loaded: Record<string, Fill[]> = {}
        await Promise.all(
          ids.map(async (id) => {
            loaded[id] = await fetchStoredFills(id)
          }),
        )
        const legacy = takeLegacyFills()
        if (legacy.length) {
          await saveFills('zerodha', legacy)
          dropLegacyFills()
          loaded.zerodha = mergeFills(loaded.zerodha ?? [], legacy)
        }
        if (cancelled) return
        setData(loaded)
        const withData = Object.keys(loaded).filter((id) => loaded[id].length)
        setActive(withData.length === 1 ? withData[0] : withData.length > 1 ? 'all' : 'zerodha')
      } catch (e) {
        if (!cancelled) {
          setActive('zerodha')
          setMessage({ tone: 'bad', text: (e as Error).message })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const today = new Date().toISOString().slice(0, 10)
  const viewData = useMemo<Record<string, Fill[]>>(() => (demo ? { [SAMPLE_BROKER]: demoFills() } : data), [demo, data])
  const ratesFor = (id: string) => ratesByBroker[id] ?? DEFAULT_CHARGE_RATES
  const brokerTabs = [...BROKERS.map((b) => b.id), ...Object.keys(data).filter((id) => !BROKERS.some((b) => b.id === id)), ...extraBrokers.filter((id) => !BROKERS.some((b) => b.id === id) && !(id in data))]

  const model = useMemo(() => {
    const from = rangeStart(range, today)
    const inRange = (date: string) => !from || date >= from
    const ids = demo ? [SAMPLE_BROKER] : active === 'all' ? Object.keys(data).filter((id) => data[id].length) : [active]
    const per = ids.map((id) => {
      const f = viewData[id] ?? []
      const { trips, open } = buildRoundTrips(f, today)
      return {
        id,
        fills: f,
        open,
        trips: trips.map((t) => ({ ...t, broker: brokerLabel(id) })),
        charges: estimateCharges(f, ratesByBroker[id] ?? DEFAULT_CHARGE_RATES),
      }
    })
    const trips = per.flatMap((p) => p.trips).filter((x) => inRange(x.closeDate))
    return {
      trips,
      open: per.flatMap((p) => p.open),
      allFills: per.flatMap((p) => p.fills).sort((x, y) => x.ts - y.ts),
      fills: per.flatMap((p) => p.fills.filter((f) => inRange(f.date)).map((f) => ({ ...f, broker: p.id }))),
      analytics: analyze(trips, per.flatMap((p) => p.charges).filter((c) => inRange(c.date))),
      expired: trips.filter((x) => x.expired).length,
    }
  }, [demo, active, data, viewData, ratesByBroker, range, today])

  const a = model.analytics
  const insights = useMemo(() => buildInsights(a), [a])

  const orders = useMemo(() => {
    const map = new Map<string, { key: string; broker: string; ts: number; date: string; time: string; symbol: string; side: string; qty: number; value: number }>()
    for (const f of model.fills) {
      const key = `${f.broker}:${f.orderId || f.id}`
      const o = map.get(key) ?? { key, broker: f.broker, ts: f.ts, date: f.date, time: f.time, symbol: f.symbol, side: f.side, qty: 0, value: 0 }
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

  async function finishImport(brokerId: string, acc: Acc) {
    try {
      if (!acc.fills.length) {
        setMessage({
          tone: 'bad',
          text: `No option trades were found. Make sure this is your F&O trade book (not equity or a summary) with buy/sell, quantity and price for each trade.${acc.samples.length ? ` Contracts I couldn't read, e.g. ${acc.samples.map((x) => `“${x}”`).join(', ')} — send me one and I'll add support.` : ''}`,
        })
        return
      }
      const { added } = await saveFills(brokerId, acc.fills)
      setData((prev) => ({ ...prev, [brokerId]: mergeFills(prev[brokerId] ?? [], acc.fills) }))
      setDemo(false)
      setShown(PAGE)
      const dupes = acc.fills.length - added
      setMessage({
        tone: 'good',
        text: `Saved ${added} new ${brokerLabel(brokerId)} option trade${added === 1 ? '' : 's'} to your vault from ${acc.files} file${acc.files === 1 ? '' : 's'}${dupes ? ` · ${dupes} already there` : ''}${acc.ignored ? ` · ${acc.ignored} non-option row${acc.ignored === 1 ? '' : 's'} ignored` : ''}.${acc.notes.length ? ` ${acc.notes.join(' ')}` : ''}`,
      })
    } catch (err) {
      setMessage({ tone: 'bad', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function importFiles(brokerId: string, files: File[], acc: Acc = { fills: [], ignored: 0, files: 0, samples: [], notes: [] }) {
    let cur = acc
    for (let i = 0; i < files.length; i++) {
      let rows: Cell[][]
      try {
        rows = await readTradeFile(files[i])
      } catch (err) {
        setMessage({ tone: 'bad', text: `${files[i].name}: ${(err as Error).message}` })
        setBusy(false)
        return
      }
      const analysis = analyseRows(rows)
      if (analysis.result) {
        cur = { fills: cur.fills.concat(analysis.result.fills), ignored: cur.ignored + analysis.result.ignoredRows, files: cur.files + 1, samples: [...cur.samples, ...analysis.result.unrecognised].slice(0, 3), notes: [...new Set([...cur.notes, ...analysis.result.notes])] }
        continue
      }
      setPending({ brokerId, fileName: files[i].name, rows, headerIdx: analysis.headerIdx, mapping: analysis.mapping, rest: files.slice(i + 1), acc: cur })
      setBusy(false)
      return
    }
    await finishImport(brokerId, cur)
  }

  async function importFileList(files: File[]) {
    if (!files.length || active === 'all' || demo || busy || loading) return
    setBusy(true)
    setMessage(null)
    await importFiles(active, files)
  }

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    await importFileList(files)
  }

  const canDrop = !demo && active !== 'all' && !busy && !loading && !pending

  function confirmMapping() {
    if (!pending) return
    const res = rowsToFills(pending.rows, pending.headerIdx, pending.mapping)
    const next = { fills: pending.acc.fills.concat(res.fills), ignored: pending.acc.ignored + res.ignoredRows, files: pending.acc.files + 1, samples: [...pending.acc.samples, ...res.unrecognised].slice(0, 3), notes: [...new Set([...pending.acc.notes, ...res.notes])] }
    const { brokerId, rest } = pending
    setPending(null)
    setBusy(true)
    void importFiles(brokerId, rest, next)
  }

  function skipFile() {
    if (!pending) return
    const { brokerId, rest, acc } = pending
    setPending(null)
    setBusy(true)
    void importFiles(brokerId, rest, acc)
  }

  async function clearBroker() {
    if (demo) {
      setDemo(false)
      return
    }
    if (active === 'all') return
    if (!window.confirm(`Delete all saved ${brokerLabel(active)} option trades from your vault? You can re-import the files later.`)) return
    setBusy(true)
    try {
      await clearStoredFills(active)
      setData((prev) => {
        const next = { ...prev }
        delete next[active]
        return next
      })
      setMessage(null)
    } catch (err) {
      setMessage({ tone: 'bad', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  function addBroker() {
    const id = slugifyBroker(newBroker)
    if (id.length < 2) return
    setExtraBrokers((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setActive(id)
    setNewBroker('')
    setAddingBroker(false)
    setShown(PAGE)
  }

  function pickBroker(id: string) {
    setActive(id)
    setShown(PAGE)
    setMessage(null)
  }

  const setRate = (k: keyof ChargeRates) => (n: number) =>
    setRatesByBroker((prev) => {
      const next = { ...prev, [active]: { ...(prev[active] ?? DEFAULT_CHARGE_RATES), [k]: n } }
      try {
        localStorage.setItem(RATES_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  const resetRates = () =>
    setRatesByBroker((prev) => {
      const next = { ...prev }
      delete next[active]
      try {
        localStorage.setItem(RATES_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })

  const fills = model.allFills
  const hasData = fills.length > 0
  const firstDate = fills[0]?.date
  const lastDate = fills.at(-1)?.date
  const activeLabel = demo ? 'Sample' : active === 'all' ? 'All brokers' : brokerLabel(active)
  const canImport = !demo && active !== 'all' && !busy && !loading
  const hasStoredForActive = active !== 'all' && (data[active]?.length ?? 0) > 0
  const rates = ratesFor(active)

  return (
    <div
      className="opt-viz relative mx-auto max-w-6xl space-y-5"
      onDragOver={(e) => {
        if (!canDrop || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        if (!canDrop) return
        e.preventDefault()
        setDragging(false)
        void importFileList(Array.from(e.dataTransfer.files))
      }}
    >
      <style>{VIZ_CSS}</style>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-bg/70 backdrop-blur-sm" aria-hidden>
          <div className="rounded-3xl border-2 border-dashed border-accent bg-card/90 px-10 py-8 text-center shadow-2xl">
            <FileUp className="mx-auto mb-2 h-8 w-8 text-accent" />
            <p className="text-sm font-semibold text-text">Drop your {brokerLabel(active)} tradebooks here</p>
            <p className="mt-1 text-xs text-text-secondary">Any number of CSV or Excel files</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Options only</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text">Options trading analytics</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            {demo
              ? 'Showing sample trades — not your account.'
              : 'Where you win, where you leak, and what it costs — kept separately for each broker, saved to your private vault.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple
            className="hidden"
            onChange={handleFiles}
            aria-label="Upload tradebook file"
          />
          {!demo && (
            <button
              type="button"
              data-cursor="hover"
              disabled={!canImport}
              title={active === 'all' ? 'Pick a broker tab to import into' : undefined}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <FileUp className="h-3.5 w-3.5" />
              {busy ? 'Saving…' : `${hasStoredForActive ? 'Add more files' : 'Import file'}${active === 'all' ? '' : ` → ${brokerLabel(active)}`}`}
            </button>
          )}
          {hasData && a.trades > 0 && (
            <ReportMenu
              filename={`options-report-${demo ? 'sample' : active}`}
              report={() => optionsReport(a, model.trips, insights, activeLabel, RANGES.find((r) => r.id === range)?.label ?? 'All time')}
              csv={() => optionsTradesCsv(model.trips)}
            />
          )}
          {(demo || hasStoredForActive) && (
            <button
              type="button"
              data-cursor="hover"
              disabled={busy}
              onClick={clearBroker}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-text-secondary transition-colors hover:border-error/40 hover:text-error"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {demo ? 'Exit preview' : `Clear ${brokerLabel(active)}`}
            </button>
          )}
        </div>
      </div>

      {!demo && (
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Broker">
          <Chip active={active === 'all'} onClick={() => pickBroker('all')}>
            All brokers
          </Chip>
          {brokerTabs.map((id) => (
            <Chip key={id} active={active === id} onClick={() => pickBroker(id)}>
              {brokerLabel(id)}
              {data[id]?.length ? <span className="ml-1.5 font-mono text-[10px] opacity-70">{data[id].length}</span> : null}
            </Chip>
          ))}
          {addingBroker ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                addBroker()
              }}
            >
              <input
                autoFocus
                value={newBroker}
                onChange={(e) => setNewBroker(e.target.value)}
                placeholder="Broker name"
                aria-label="New broker name"
                className="w-36 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-text outline-none focus:border-accent/50"
              />
              <button type="submit" data-cursor="hover" className="rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary hover:text-text">
                Add
              </button>
            </form>
          ) : (
            <Chip active={false} onClick={() => setAddingBroker(true)}>
              + Add broker
            </Chip>
          )}
        </div>
      )}

      {message && (
        <p role="status" className={cn('rounded-lg border px-3 py-2 text-xs', message.tone === 'good' ? 'border-accent/30 bg-accent/10 text-accent' : 'border-error/30 bg-error/10 text-error')}>
          {message.text}
        </p>
      )}

      {pending && <MappingCard pending={pending} onChange={setPending} onConfirm={confirmMapping} onSkip={skipFile} />}

      {loading ? (
        <GlassCard hover={false} className="flex items-center justify-center gap-3 py-24 text-sm text-text-secondary">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading your trade history…
        </GlassCard>
      ) : !hasData ? (
        <GlassCard hover={false} className="mx-auto max-w-2xl space-y-4 px-6 py-10">
          {active === 'all' ? (
            <>
              <h2 className="font-display text-xl font-semibold text-text">Import your options trade history</h2>
              <p className="text-sm text-text-secondary">
                Choose your broker above, then import its F&amp;O trade book as CSV or Excel. Each broker is stored and analysed separately; this tab combines them.
              </p>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl font-semibold text-text">Import your {activeLabel} options trades</h2>
              <p className="text-sm text-text-secondary">{brokerHint(active)}</p>
              <p className="text-sm text-text-secondary">
                Drag in as many files as you like, or choose them. Files are read in your browser; only the option trades are saved to your private vault, so they&apos;re there on any device. Columns are detected
                automatically, and you can map them by hand if a file is unusual. Quantities should be in units, not lots. Duplicates are skipped.
              </p>
            </>
          )}
          <div className="flex flex-wrap gap-3 pt-2">
            {active !== 'all' && (
              <button
                type="button"
                data-cursor="hover"
                disabled={!canImport}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <FileUp className="h-4 w-4" />
                Import {activeLabel} file
              </button>
            )}
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
                <Kpi label="Net P&L" fit={`  ${formatSignedInr(a.net)}`} value={<Money value={a.net} />} sub={a.chargesSource === 'actual' ? 'after your actual charges' : 'after est. charges'} />
                <Kpi label="Gross P&L" fit={`  ${formatSignedInr(a.gross)}`} value={<Money value={a.gross} />} sub={`${a.trades} closed trades`} />
                <Kpi
                  label={a.chargesSource === 'actual' ? 'Charges' : 'Charges (est.)'}
                  fit={formatInr(a.charges)}
                  value={formatInr(a.charges)}
                  valueClassName="text-amber-500"
                  sub={a.gross > 0 ? `${Math.round((a.charges / a.gross) * 100)}% of gross profit` : 'brokerage, STT, GST…'}
                />
                <Kpi label="Win rate" fit={`${a.winRate.toFixed(1)}%`} value={`${a.winRate.toFixed(1)}%`} sub={`${a.wins} wins · ${a.losses} losses`} />
                <Kpi label="Profit factor" fit={a.profitFactor === null ? '—' : a.profitFactor.toFixed(2)} value={a.profitFactor === null ? '—' : a.profitFactor.toFixed(2)} sub="gross wins ÷ gross losses" />
                <Kpi
                  label="Avg win / loss"
                  fit={`${formatInr(a.avgWin)} / ${formatInr(a.avgLoss)}`}
                  value={<>{formatInr(a.avgWin)} <span className="text-text-secondary">/</span> {formatInr(a.avgLoss)}</>}
                  valueClassName="whitespace-nowrap"
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
                  {active === 'all' && !demo && a.breakdowns.broker.length > 1 && <BreakdownCard title="By broker" slices={a.breakdowns.broker} />}
                  <BreakdownCard title="By index / stock" slices={a.breakdowns.underlying} />
                  <BreakdownCard title="Calls vs puts" slices={a.breakdowns.type} />
                  <BreakdownCard title="Buying vs selling" slices={a.breakdowns.direction} />
                  <BreakdownCard title="By weekday" note="day of entry" slices={a.breakdowns.weekday} />
                  {a.breakdowns.entryHour.some((x) => x.key !== '00:00') && (
                    <BreakdownCard title="By entry time" note="hour of entry (IST)" slices={a.breakdowns.entryHour} />
                  )}
                  <BreakdownCard title="By days to expiry" note="monthly = approx." slices={a.breakdowns.dte} />
                  <BreakdownCard title="By holding time" slices={a.breakdowns.hold} />
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <TripList title="Top 5 winners" trips={a.topWins} />
                <TripList title="Top 5 losers" trips={a.topLosses} />
              </div>

              <GlassCard hover={false} className="p-5">
                <SectionTitle aside={<span className="text-xs font-mono text-text">{formatInr(a.charges)}</span>}>{a.chargesSource === 'actual' ? 'Charges (from your statements)' : a.chargesSource === 'mixed' ? 'Charges (statement + estimated)' : 'Charges (estimated)'}</SectionTitle>
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
                {active === 'all' && !demo ? (
                  <p className="mt-4 text-xs text-text-secondary">Each broker uses its own charge assumptions — open a broker tab to edit them.</p>
                ) : (
                <details className="mt-4 rounded-xl border border-border bg-surface-2 p-3 text-xs text-text-secondary">
                  <summary className="cursor-pointer font-medium text-text">Charge assumptions{demo ? '' : ` — ${activeLabel}`}</summary>
                  {a.chargesSource === 'actual' && <p className="mt-2 text-accent">Your statements include the actual charges, so these assumptions aren&apos;t being used.</p>}
                  <p className="mt-2">
                    Estimates from a typical ₹20-flat options fee schedule (Zerodha-style). Brokerage plans and rates (STT especially) differ by broker and change over time — match these to your contract notes.
                    Saved per broker in this browser.
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
                      onClick={resetRates}
                      className="self-end rounded-md border border-border px-2 py-1.5 text-text-secondary transition-colors hover:text-text"
                    >
                      Reset
                    </button>
                  </div>
                </details>
                )}
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
                    <table className="w-full min-w-[700px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-secondary">
                          <th className="py-2 pr-3 font-medium">Closed</th>
                          {active === 'all' && !demo && <th className="py-2 pr-3 font-medium">Broker</th>}
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
                            {active === 'all' && !demo && <td className="py-2.5 pr-3 text-text-secondary">{t.broker}</td>}
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
                          {active === 'all' && !demo && <th className="py-2 pr-3 font-medium">Broker</th>}
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
                            {active === 'all' && !demo && <td className="py-2.5 pr-3 text-text-secondary">{brokerLabel(o.broker)}</td>}
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
