import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, Link2, PlugZap, RefreshCw, Unplug, Wallet } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/utils'
import {
  KiteTokenExpiredError,
  allocationSlices,
  clearKiteSession,
  createKiteSession,
  endKiteSession,
  fetchKiteSnapshot,
  formatInr,
  formatSignedInr,
  formatSignedPct,
  getKiteLoginUrl,
  getKiteSession,
  holdingRows,
  marginSummary,
  openPositions,
  portfolioTotals,
  storeKiteSession,
  type HoldingRow,
  type KiteOrder,
  type KiteSession,
  type KiteSnapshot,
} from '@/lib/kite'
import { demoSnapshot } from '@/lib/kiteDemo'
import { ReportMenu } from '@/components/viz/ReportMenu'
import { zerodhaHoldingsCsv, zerodhaReport } from '@/lib/moduleReports'

const AUTO_REFRESH_MS = 30_000

// Palette order validated for adjacent-pair colour-blind separation (light and dark).
const SERIES_CSS = `
.kite-viz{--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s-other:#6b7280}
:root:is([data-theme='light'],[data-theme='royal-light']) .kite-viz{--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--s-other:#9ca3af}
`
const seriesColor = (i: number, isOther: boolean) => (isOther ? 'var(--s-other)' : `var(--s${i + 1})`)

type SortKey = 'value' | 'pnl' | 'day' | 'symbol'

const tone = (n: number) => (n > 0 ? 'text-positive' : n < 0 ? 'text-error' : 'text-text-secondary')

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="label-caps">{children}</h2>
      {aside}
    </div>
  )
}

function Delta({ value, pct, decimals = 0 }: { value: number; pct?: number; decimals?: number }) {
  const Icon = value < 0 ? ArrowDownRight : ArrowUpRight
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap font-mono', tone(value))}>
      {value !== 0 && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {formatSignedInr(value, decimals)}
      {pct !== undefined && <span className="text-[0.85em] opacity-80">({formatSignedPct(pct)})</span>}
    </span>
  )
}

function KpiDelta({ value, pct }: { value: number; pct: number }) {
  const Icon = value < 0 ? ArrowDownRight : ArrowUpRight
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap font-mono', tone(value))}>
      {value !== 0 && <Icon className="h-5 w-5" aria-hidden />}
      {formatSignedInr(value)}
      <span className="sr-only">{formatSignedPct(pct)}</span>
    </span>
  )
}

function PctNote({ value, pct, children }: { value: number; pct: number; children: ReactNode }) {
  return (
    <>
      <span className={cn('font-mono font-semibold', tone(value))}>{formatSignedPct(pct)}</span> {children}
    </>
  )
}

function Kpi({ label, children, sub, className }: { label: string; children: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <GlassCard hover={false} className={cn('p-5', className)}>
      <p className="label-caps">{label}</p>
      <div className="mt-2 font-display text-2xl font-semibold text-text">{children}</div>
      {sub && <div className="mt-1.5 text-xs text-text-secondary">{sub}</div>}
    </GlassCard>
  )
}

function ConnectScreen({
  onConnect,
  onDemo,
  busy,
  error,
}: {
  onConnect: () => void
  onDemo: () => void
  busy: boolean
  error: string | null
}) {
  return (
    <GlassCard hover={false} className="mx-auto mt-6 flex max-w-lg flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <PlugZap className="h-7 w-7" />
      </span>
      <div>
        <h2 className="section-title">Connect your Zerodha account</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Sign in through Kite to see your holdings, positions, orders and margin here. Nothing is stored — the session
          lasts until Kite resets it (around 6 AM) or you close this tab.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          data-cursor="hover"
          disabled={busy}
          onClick={onConnect}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Link2 className="h-4 w-4" />
          {busy ? 'Connecting…' : 'Connect Zerodha'}
        </button>
        <button
          type="button"
          data-cursor="hover"
          disabled={busy}
          onClick={onDemo}
          className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
        >
          Preview with sample data
        </button>
      </div>
    </GlassCard>
  )
}

function AllocationCard({ rows }: { rows: HoldingRow[] }) {
  const slices = allocationSlices(rows)
  const top3 = slices.filter((s) => !s.isOther).slice(0, 3).reduce((sum, s) => sum + s.pct, 0)
  const [active, setActive] = useState<number | null>(null)
  return (
    <GlassCard hover={false} className="p-5">
      <SectionTitle>Allocation by holding</SectionTitle>
      {slices.length === 0 ? (
        <p className="text-sm text-text-secondary">No holdings to chart.</p>
      ) : (
        <>
          <div className="flex h-4 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Portfolio allocation by holding">
            {slices.map((s, i) => (
              <div
                key={s.label}
                title={`${s.label} · ${s.pct.toFixed(1)}% · ${formatInr(s.value)}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${s.pct}%`,
                  background: seriesColor(i, s.isOther),
                  opacity: active === null || active === i ? 1 : 0.35,
                }}
              />
            ))}
          </div>
          <ul className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            {slices.map((s, i) => (
              <li
                key={s.label}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex min-w-0 items-center gap-2 text-text">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: seriesColor(i, s.isOther) }} />
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="shrink-0 font-mono text-text-secondary">
                  {s.pct.toFixed(1)}% · {formatInr(s.value)}
                </span>
              </li>
            ))}
          </ul>
          {top3 > 0 && (
            <p className="mt-4 rounded-xl border border-border bg-surface-2 p-3 text-xs text-text-secondary">
              <strong className="text-text">Concentration:</strong> your top 3 holdings make up{' '}
              <span className="font-mono font-semibold text-text">{top3.toFixed(1)}%</span> of the portfolio.
            </p>
          )}
        </>
      )}
    </GlassCard>
  )
}

function PnlBars({ rows }: { rows: HoldingRow[] }) {
  const sorted = [...rows].sort((a, b) => b.pnl - a.pnl)
  const max = Math.max(1, ...sorted.map((r) => Math.abs(r.pnl)))
  return (
    <GlassCard hover={false} className="p-5">
      <SectionTitle>Profit / loss by holding</SectionTitle>
      {sorted.length === 0 ? (
        <p className="text-sm text-text-secondary">No holdings to chart.</p>
      ) : (
        <ul className="space-y-2.5">
          {sorted.map((r) => {
            const width = (Math.abs(r.pnl) / max) * 100
            return (
              <li key={r.symbol} className="grid grid-cols-[84px_1fr_auto] items-center gap-3 text-xs">
                <span className="truncate font-mono font-semibold text-text">{r.symbol}</span>
                <div className="relative h-2.5" title={`${r.symbol} · ${formatSignedInr(r.pnl)} (${formatSignedPct(r.pnlPct)})`}>
                  <span className="absolute inset-y-0 left-1/2 w-px bg-border" aria-hidden />
                  <div
                    className={cn('absolute inset-y-0 rounded-full', r.pnl >= 0 ? 'bg-positive' : 'bg-error')}
                    style={
                      r.pnl >= 0
                        ? { left: '50%', width: `${width / 2}%` }
                        : { right: '50%', width: `${width / 2}%` }
                    }
                  />
                </div>
                <span className={cn('w-24 text-right font-mono', tone(r.pnl))}>{formatSignedInr(r.pnl)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </GlassCard>
  )
}

function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  const [sort, setSort] = useState<SortKey>('value')
  const sorted = useMemo(() => {
    const by: Record<SortKey, (a: HoldingRow, b: HoldingRow) => number> = {
      value: (a, b) => b.value - a.value,
      pnl: (a, b) => b.pnl - a.pnl,
      day: (a, b) => b.dayPnl - a.dayPnl,
      symbol: (a, b) => a.symbol.localeCompare(b.symbol),
    }
    return [...rows].sort(by[sort])
  }, [rows, sort])

  const Th = ({ k, children, right }: { k: SortKey; children: ReactNode; right?: boolean }) => (
    <th className={cn('py-2 pr-3 font-medium', right && 'text-right')}>
      <button
        type="button"
        data-cursor="hover"
        onClick={() => setSort(k)}
        className={cn('uppercase tracking-wide transition-colors hover:text-text', sort === k && 'text-accent')}
      >
        {children}
        {sort === k && ' ↓'}
      </button>
    </th>
  )

  return (
    <GlassCard hover={false} className="p-5">
      <SectionTitle aside={<span className="text-2xs text-text-secondary">{rows.length} holdings · click a column to sort</span>}>
        Holdings
      </SectionTitle>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">No holdings in this account.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-2xs text-text-secondary">
                <Th k="symbol">Symbol</Th>
                <th className="py-2 pr-3 text-right font-medium uppercase tracking-wide">Qty</th>
                <th className="py-2 pr-3 text-right font-medium uppercase tracking-wide">Avg</th>
                <th className="py-2 pr-3 text-right font-medium uppercase tracking-wide">LTP</th>
                <Th k="value" right>Value</Th>
                <Th k="pnl" right>P&amp;L</Th>
                <Th k="day" right>Day</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.symbol} className="border-b border-border/60 transition-colors hover:bg-surface-3">
                  <td className="py-2.5 pr-3 font-mono font-semibold text-text">{r.symbol}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-text-secondary">{r.qty}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-text-secondary">{formatInr(r.avg, 2)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-text">{formatInr(r.ltp, 2)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-text">{formatInr(r.value)}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <Delta value={r.pnl} pct={r.pnlPct} />
                  </td>
                  <td className="py-2.5 text-right">
                    <Delta value={r.dayPnl} pct={r.dayPct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  )
}

const ORDER_STATUS_STYLE: Record<string, string> = {
  COMPLETE: 'bg-accent/15 text-accent',
  OPEN: 'bg-sky-500/15 text-sky-500',
  'TRIGGER PENDING': 'bg-amber-500/15 text-amber-500',
  REJECTED: 'bg-error/15 text-error',
  CANCELLED: 'bg-surface-10 text-text-secondary',
}

function OrderRow({ o }: { o: KiteOrder }) {
  const time = o.order_timestamp?.split(' ')[1]?.slice(0, 5) ?? ''
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 text-xs last:border-0">
      <div className="min-w-0">
        <p className="truncate font-mono font-semibold text-text">
          <span className={o.transaction_type === 'BUY' ? 'text-positive' : 'text-error'}>{o.transaction_type}</span>{' '}
          {o.tradingsymbol}
        </p>
        <p className="mt-0.5 text-text-secondary">
          {o.quantity} · {o.order_type}
          {o.price ? ` @ ${formatInr(o.price, 2)}` : ''} · {o.product}
          {time && ` · ${time}`}
        </p>
      </div>
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold',
          ORDER_STATUS_STYLE[o.status] ?? 'bg-surface-10 text-text-secondary',
        )}
      >
        {o.status}
      </span>
    </li>
  )
}

function Dashboard({ snapshot }: { snapshot: KiteSnapshot }) {
  const rows = useMemo(() => holdingRows(snapshot.holdings), [snapshot.holdings])
  const totals = portfolioTotals(rows)
  const margin = marginSummary(snapshot.margins)
  const positions = openPositions(snapshot.positions)
  const positionsTotal = positions.reduce((s, p) => s + p.pnl, 0)
  const orders = [...(snapshot.orders ?? [])].sort((a, b) => b.order_timestamp.localeCompare(a.order_timestamp)).slice(0, 8)
  const errored = Object.keys(snapshot.errors ?? {})

  return (
    <div className="space-y-5">
      {errored.length > 0 && (
        <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
          Couldn&apos;t load: {errored.join(', ')}. The rest of the dashboard is still current.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          className="md:col-span-2 xl:col-span-1"
          label="Portfolio value"
          sub={<>Invested {formatInr(totals.invested)}</>}
        >
          <span className="text-3xl">{formatInr(totals.value)}</span>
        </Kpi>
        <Kpi
          label="Today's P&L"
          sub={
            <PctNote value={totals.dayPnl} pct={totals.dayPct}>
              vs previous close
            </PctNote>
          }
        >
          <KpiDelta value={totals.dayPnl} pct={totals.dayPct} />
        </Kpi>
        <Kpi
          label="Total returns"
          sub={
            <PctNote value={totals.pnl} pct={totals.pnlPct}>
              on invested amount
            </PctNote>
          }
        >
          <KpiDelta value={totals.pnl} pct={totals.pnlPct} />
        </Kpi>
        <Kpi
          label="Available margin"
          sub={margin ? `${formatInr(margin.used)} used of ${formatInr(margin.total)}` : 'Not available'}
        >
          <span className="inline-flex items-center gap-2">
            <Wallet className="h-5 w-5 text-text-secondary" aria-hidden />
            {margin ? formatInr(margin.available) : '—'}
          </span>
          {margin && (
            <div
              role="meter"
              aria-label="Margin used"
              aria-valuenow={Math.round(margin.usedPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-10"
            >
              <div
                className={cn('h-full rounded-full', margin.usedPct > 80 ? 'bg-error' : margin.usedPct > 50 ? 'bg-amber-500' : 'bg-positive')}
                style={{ width: `${Math.min(margin.usedPct, 100)}%` }}
              />
            </div>
          )}
        </Kpi>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <AllocationCard rows={rows} />
        <PnlBars rows={rows} />
      </div>

      <HoldingsTable rows={rows} />

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard hover={false} className="p-5">
          <SectionTitle
            aside={
              positions.length > 0 && (
                <span className="text-xs">
                  <Delta value={positionsTotal} />
                </span>
              )
            }
          >
            Open positions
          </SectionTitle>
          {positions.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-secondary">No open positions.</p>
          ) : (
            <ul>
              {positions.map((p) => (
                <li key={`${p.tradingsymbol}-${p.product}`} className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 text-xs last:border-0">
                  <div className="min-w-0">
                    <p className="truncate font-mono font-semibold text-text">{p.tradingsymbol}</p>
                    <p className="mt-0.5 text-text-secondary">
                      {p.quantity > 0 ? 'Long' : 'Short'} {Math.abs(p.quantity)} · {p.product} · avg {formatInr(p.average_price, 2)} · LTP{' '}
                      {formatInr(p.last_price, 2)}
                    </p>
                  </div>
                  <Delta value={p.pnl} decimals={2} />
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard hover={false} className="p-5">
          <SectionTitle aside={<span className="text-2xs text-text-secondary">latest {orders.length}</span>}>
            Today&apos;s orders
          </SectionTitle>
          {orders.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-secondary">No orders placed today.</p>
          ) : (
            <ul>
              {orders.map((o) => (
                <OrderRow key={o.order_id} o={o} />
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      <p className="text-center text-2xs text-text-secondary/70">
        Equity holdings only — mutual funds held via Coin aren&apos;t included. Prices are as of the last refresh and may
        be delayed.
      </p>
    </div>
  )
}

export function ZerodhaDashboard() {
  const [params, setParams] = useSearchParams()
  const [session, setSession] = useState<KiteSession | null>(getKiteSession)
  const [demo, setDemo] = useState(false)
  const [snapshot, setSnapshot] = useState<KiteSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const exchanged = useRef(false)

  const requestToken = params.get('request_token')
  const loginStatus = params.get('status')

  useEffect(() => {
    if (!requestToken && !loginStatus) return
    if (exchanged.current) return
    exchanged.current = true
    setParams({}, { replace: true })

    if (loginStatus !== 'success' || !requestToken) {
      setError('Zerodha login was cancelled or failed. Please try again.')
      return
    }
    setConnecting(true)
    createKiteSession(requestToken)
      .then((s) => {
        storeKiteSession(s)
        setSession(s)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setConnecting(false))
  }, [requestToken, loginStatus, setParams])

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      setSnapshot(await fetchKiteSnapshot(session.accessToken))
      setError(null)
    } catch (e) {
      if (e instanceof KiteTokenExpiredError) {
        clearKiteSession()
        setSession(null)
        setSnapshot(null)
      }
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (session) load()
  }, [session, load])

  useEffect(() => {
    if (!autoRefresh || !session) return
    const id = setInterval(load, AUTO_REFRESH_MS)
    return () => clearInterval(id)
  }, [autoRefresh, session, load])

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    try {
      window.location.href = await getKiteLoginUrl()
    } catch (e) {
      setError((e as Error).message)
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    if (session) await endKiteSession(session.accessToken)
    clearKiteSession()
    setSession(null)
    setSnapshot(null)
    setDemo(false)
    setAutoRefresh(false)
  }

  const live = Boolean(session)
  const data = demo ? demoSnapshot() : snapshot
  const userName = demo ? 'Sample Trader' : (snapshot?.profile?.user_name ?? session?.userName)
  const updated = data ? new Date(data.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null

  return (
    <div className="kite-viz w-full space-y-5">
      <style>{SERIES_CSS}</style>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="page-eyebrow">Zerodha · Kite</p>
          <h1 className="mt-1 page-title">
            {userName ? `${userName}'s portfolio` : 'Trading dashboard'}
          </h1>
          <p className="page-lede">
            {demo ? 'Showing sample data — not your account.' : 'Live holdings, positions, orders and margin from Kite Connect.'}
          </p>
        </div>

        {(live || demo) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {updated && <span className="text-text-secondary">Updated {updated}</span>}
            {live && (
              <>
                <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-text-secondary">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="accent-accent"
                  />
                  Auto-refresh 30s
                </label>
                <button
                  type="button"
                  data-cursor="hover"
                  onClick={load}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-text-secondary transition-colors hover:border-accent/40 hover:text-text disabled:opacity-60"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                  Refresh
                </button>
              </>
            )}
            <button
              type="button"
              data-cursor="hover"
              onClick={handleDisconnect}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-text-secondary transition-colors hover:border-error/40 hover:text-error"
            >
              <Unplug className="h-3.5 w-3.5" />
              {demo ? 'Exit preview' : 'Disconnect'}
            </button>
            {data && <ReportMenu filename="zerodha-portfolio-report" report={() => zerodhaReport(data, userName ?? 'Zerodha', demo)} csv={() => zerodhaHoldingsCsv(data)} />}
          </div>
        )}
      </div>

      {live && error && (
        <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
          {error}
        </p>
      )}

      {data ? (
        <Dashboard snapshot={data} />
      ) : live ? (
        <GlassCard hover={false} className="flex items-center justify-center gap-3 py-24 text-sm text-text-secondary">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading your portfolio…
        </GlassCard>
      ) : (
        <ConnectScreen onConnect={handleConnect} onDemo={() => setDemo(true)} busy={connecting} error={error} />
      )}
    </div>
  )
}
