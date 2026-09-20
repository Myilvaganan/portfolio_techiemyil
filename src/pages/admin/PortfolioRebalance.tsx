import { useState, type ReactNode } from 'react'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/utils'
import {
  BUCKETS,
  BUCKET_IDS,
  DAILY_TARGET,
  HOLDINGS,
  SNAPSHOT,
  dailyReturnPct,
  defaultTargets,
  pctOf,
  rebalance,
  totalValue,
  type BucketId,
  type HoldingAction,
} from '@/lib/portfolio'

const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`
const signedInr = (n: number) => `${n >= 0 ? '+' : '-'}${inr(n)}`
const pct = (n: number, d = 1) => `${n.toFixed(d)}%`

const ACTION_STYLE: Record<HoldingAction, { label: string; className: string }> = {
  reduce: { label: 'REDUCE', className: 'bg-amber-500/15 text-amber-500' },
  review: { label: 'REVIEW', className: 'bg-error/15 text-error' },
  core: { label: 'CORE', className: 'bg-sky-500/15 text-sky-500' },
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">{children}</h2>
}

function Kpi({ label, value, sub, valueClassName }: { label: string; value: string; sub?: string; valueClassName?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <p className="text-[11px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={cn('mt-1 font-mono text-xl font-bold text-text', valueClassName)}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-text-secondary/70">{sub}</p>}
    </div>
  )
}

function Bar({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr_56px] items-center gap-3 text-xs">
      <span className="text-text-secondary">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-surface-7">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${Math.min(value, 100)}%`, background: color }}
        />
      </div>
      <b className="text-right font-mono text-text">{pct(value)}</b>
    </div>
  )
}

function Donut({ title, segments, center }: { title: string; segments: { pct: number; color: string }[]; center: string }) {
  let acc = 0
  const stops = segments
    .filter((s) => s.pct > 0)
    .map((s) => {
      const from = acc
      acc += s.pct
      return `${s.color} ${from}% ${acc}%`
    })
  return (
    <div className="text-center">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-text-secondary">{title}</p>
      <div
        role="img"
        aria-label={title}
        className="relative mx-auto h-32 w-32 rounded-full"
        style={{ background: `conic-gradient(${stops.join(', ') || 'transparent 0 100%'})` }}
      >
        <div className="absolute inset-4 grid place-items-center rounded-full bg-card font-mono text-sm font-bold text-text">
          {center}
        </div>
      </div>
    </div>
  )
}

export function PortfolioRebalance() {
  const [targets, setTargets] = useState(defaultTargets)

  const total = totalValue(HOLDINGS)
  const rows = rebalance(HOLDINGS, targets)
  const targetSum = BUCKET_IDS.reduce((s, id) => s + (targets[id] || 0), 0)
  const targetsValid = Math.abs(targetSum - 100) < 0.01
  const toSell = rows.filter((r) => r.delta < 0).reduce((s, r) => s + -r.delta, 0)
  const toBuy = rows.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0)

  const value = (symbol: string) => HOLDINGS.find((h) => h.symbol === symbol)?.value ?? 0
  const gold = value('GOLDBEES')
  const silver = value('SILVERBEES')
  const textile = HOLDINGS.filter((h) => h.textile).reduce((s, h) => s + h.value, 0)
  const indexEtfs = value('ICICINIFTY') + value('ICICINXT50')

  const holdingsSorted = [...HOLDINGS].sort((a, b) => b.value - a.value)

  function setTarget(id: BucketId, text: string) {
    const n = parseFloat(text)
    setTargets((prev) => ({ ...prev, [id]: Number.isFinite(n) ? Math.max(0, n) : 0 }))
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Portfolio intelligence</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-text">Portfolio Rebalance Blueprint</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          A diversified framework built from the {SNAPSHOT.holdingCount} holdings in the {SNAPSHOT.label} snapshot. The
          goal is long-term wealth building, not a guaranteed daily return.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Current value" value={inr(total)} />
        <Kpi
          label="Today's P&L"
          value={signedInr(SNAPSHOT.todayPnl)}
          sub={`+${SNAPSHOT.todayPnlPct.toFixed(2)}% (snapshot)`}
          valueClassName="text-accent"
        />
        <Kpi label="Holdings" value={String(SNAPSHOT.holdingCount)} sub="Stocks + ETFs" />
        <Kpi
          label="Commodity exposure"
          value={pct(pctOf(gold + silver, total))}
          sub="Gold + Silver"
          valueClassName="text-amber-500"
        />
      </div>

      <GlassCard hover={false} className="p-5">
        <SectionTitle>01 — Portfolio diagnosis</SectionTitle>
        <p className="mb-4 text-xs text-text-secondary">
          The main structural issue is concentration, not the number of green positions today.
        </p>
        <div className="space-y-3">
          <Bar label="Gold" value={pctOf(gold, total)} color={BUCKETS.gold.color} />
          <Bar label="Silver" value={pctOf(silver, total)} color={BUCKETS.silver.color} />
          <Bar label="Textile (4 named)" value={pctOf(textile, total)} />
          <Bar label="Index ETFs" value={pctOf(indexEtfs, total)} color={BUCKETS.nifty50.color} />
        </div>
        <p className="mt-4 rounded-xl border border-border bg-surface-2 p-3 text-xs text-text-secondary">
          <strong className="text-text">Key observation:</strong> Gold + Silver are {inr(gold + silver)}, or{' '}
          {pct(pctOf(gold + silver, total))} of the portfolio. Textile-related names add sector concentration on top.
        </p>
      </GlassCard>

      <GlassCard hover={false} className="p-5">
        <SectionTitle>02 — Current holdings review</SectionTitle>
        <p className="mb-4 text-xs text-text-secondary">
          A “review” tag means fundamentals and valuation need checking before adding or exiting.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-secondary">
                <th className="py-2 pr-3 font-medium">Holding</th>
                <th className="py-2 pr-3 text-right font-medium">Value</th>
                <th className="py-2 pr-3 text-right font-medium">Weight</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {holdingsSorted.map((h) => (
                <tr key={h.symbol} className="border-b border-border/60">
                  <td className="py-2.5 pr-3 font-mono font-semibold text-text">
                    {h.symbol}
                    {h.count ? <span className="ml-1 font-sans font-normal text-text-secondary">({h.count})</span> : null}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-text">{inr(h.value)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-text-secondary">{pct(pctOf(h.value, total))}</td>
                  <td className="py-2.5 pr-3 text-text-secondary">{h.role}</td>
                  <td className="py-2.5">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', ACTION_STYLE[h.action].className)}>
                      {ACTION_STYLE[h.action].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard hover={false} className="p-5">
        <SectionTitle>03 — Destination portfolio</SectionTitle>
        <p className="mb-4 text-xs text-text-secondary">
          Edit the target % per bucket; buy/sell amounts update for {inr(total)}. ETF choice should weigh expense
          ratio, tracking difference, liquidity and taxation.
        </p>

        <div className="mb-5 grid grid-cols-2 gap-4">
          <Donut
            title="Current"
            center={inr(total)}
            segments={rows.map((r) => ({ pct: r.currentPct, color: BUCKETS[r.id].color }))}
          />
          <Donut
            title="Target"
            center={targetsValid ? inr(total) : `${targetSum.toFixed(0)}%`}
            segments={rows.map((r) => ({ pct: (r.targetPct / (targetSum || 1)) * 100, color: BUCKETS[r.id].color }))}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-secondary">
                <th className="py-2 pr-3 font-medium">Bucket</th>
                <th className="py-2 pr-3 text-right font-medium">Now</th>
                <th className="py-2 pr-3 text-right font-medium">Target %</th>
                <th className="py-2 pr-3 text-right font-medium">Target ₹</th>
                <th className="py-2 text-right font-medium">Buy / sell</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-2.5 pr-3 text-text">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: BUCKETS[r.id].color }} />
                    {BUCKETS[r.id].label}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-text-secondary">
                    {inr(r.current)} · {pct(r.currentPct)}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      aria-label={`${BUCKETS[r.id].label} target percent`}
                      value={targets[r.id]}
                      onChange={(e) => setTarget(r.id, e.target.value)}
                      className="w-16 rounded-md border border-border bg-surface-2 px-2 py-1 text-right font-mono text-xs text-text outline-none focus:border-accent/50"
                    />
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-text">{inr(r.target)}</td>
                  <td
                    className={cn(
                      'py-2.5 text-right font-mono font-semibold',
                      r.delta >= 0 ? 'text-accent' : 'text-error',
                    )}
                  >
                    {signedInr(r.delta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className={cn('font-medium', targetsValid ? 'text-text-secondary' : 'text-error')}>
            Targets total {targetSum.toFixed(1)}%{targetsValid ? '' : ' — must equal 100%'}
          </span>
          <button
            type="button"
            data-cursor="hover"
            onClick={() => setTargets(defaultTargets())}
            className="rounded-md border border-border bg-surface-2 px-3 py-1 text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
          >
            Reset to default mix
          </button>
        </div>
        {targetsValid && (
          <p className="mt-3 text-center text-xs text-text-secondary">
            Sell about <b className="font-mono text-error">{inr(toSell)}</b> · buy about{' '}
            <b className="font-mono text-accent">{inr(toBuy)}</b>
          </p>
        )}
      </GlassCard>

      <GlassCard hover={false} className="p-5">
        <SectionTitle>04 — Rebalancing roadmap</SectionTitle>
        <p className="mb-4 text-xs text-text-secondary">
          A staged transition avoids making the whole portfolio depend on one trading day.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              title: 'Reduce concentration',
              body: `Bring Gold from ~${inr(gold)} toward ~${inr(rows.find((r) => r.id === 'gold')!.target)} and Silver from ~${inr(silver)} toward ~${inr(rows.find((r) => r.id === 'silver')!.target)}, subject to taxes and your holding period.`,
            },
            {
              title: 'Build the core',
              body: 'Deploy released capital gradually into broad-market ETFs rather than replacing one concentrated position with another.',
            },
            {
              title: 'Control stock bets',
              body: 'Keep individual stocks as a smaller satellite allocation. Review earnings, debt, valuation and sector concentration before adding.',
            },
          ].map((s, i) => (
            <div key={s.title} className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="mb-2 grid h-7 w-7 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                {i + 1}
              </div>
              <h3 className="text-sm font-semibold text-text">{s.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">{s.body}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard hover={false} className="p-5">
        <SectionTitle>Risk note</SectionTitle>
        <p className="text-xs leading-relaxed text-text-secondary">
          This is an educational portfolio framework based on the supplied snapshot, not a guarantee of returns or
          personalised regulated investment advice. A target of {inr(DAILY_TARGET)} every trading day from {inr(total)}{' '}
          implies about {dailyReturnPct(total).toFixed(2)}% per trading day and should not be treated as a dependable
          investment return. Before executing a rebalance, verify current prices, taxes, exit loads, ETF liquidity,
          tracking difference and your own time horizon.
        </p>
      </GlassCard>

      <p className="text-center text-[11px] text-text-secondary/70">
        Values are approximate snapshot figures and change with market prices.
      </p>
    </div>
  )
}
