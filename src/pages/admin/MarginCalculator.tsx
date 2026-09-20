import { useEffect, useState, type ReactNode } from 'react'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/utils'
import { fetchLivePrices, fetchUsdInr } from '@/lib/livePrices'
import {
  DEFAULT_LEVERAGE,
  FALLBACK_USD_INR,
  INSTRUMENTS,
  LEVERAGE_OPTIONS,
  LOT_MAX,
  LOT_MIN,
  calcMargin,
  calcPnL,
  calcRisk,
  type Direction,
  type InstrumentId,
} from '@/lib/margin'

type PriceStatus = 'loading' | 'live' | 'est'

const INSTRUMENT_IDS = Object.keys(INSTRUMENTS) as InstrumentId[]
const QUICK_LOTS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2]
const TAX_RATE = 0.3

const inputClass =
  'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-text outline-none transition-colors focus:border-accent/50'

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function signed(n: number, decimals = 2) {
  return `${n >= 0 ? '+' : '-'}$${fmt(Math.abs(n), decimals)}`
}

// Small grey rupee equivalent shown under every USD amount. Takes a signed USD
// value so losses and profits keep their sign.
function toInr(usd: number, rate: number) {
  const inr = usd * rate
  const abs = Math.abs(inr)
  const text = abs.toLocaleString('en-IN', {
    minimumFractionDigits: abs >= 10000 ? 0 : 2,
    maximumFractionDigits: abs >= 10000 ? 0 : 2,
  })
  return `≈ ${inr < 0 ? '-' : ''}₹${text}`
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">{label}</span>
      {children}
    </label>
  )
}

function Stat({
  label,
  value,
  inr,
  sub,
  tax,
  className,
  valueClassName,
}: {
  label: string
  value: string
  inr?: string
  sub?: string
  tax?: string
  className?: string
  valueClassName?: string
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface-2 p-3 text-center', className)}>
      <p className="text-[11px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={cn('mt-1.5 font-mono text-2xl font-bold text-text', valueClassName)}>{value}</p>
      {inr && <p className="mt-0.5 font-mono text-[11px] text-text-secondary/60">{inr}</p>}
      {tax && <p className="mt-0.5 font-mono text-[11px] text-amber-500/80">{tax}</p>}
      {sub && <p className="mt-1 text-[11px] text-text-secondary/70">{sub}</p>}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs">
      <span className="text-text-secondary">{label}</span>
      <span className="font-mono font-semibold text-text">{value}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">{children}</h2>
}

export function MarginCalculator() {
  const [current, setCurrent] = useState<InstrumentId>('XAUUSD')
  const [prices, setPrices] = useState(() =>
    Object.fromEntries(
      INSTRUMENT_IDS.map((id) => [id, { price: INSTRUMENTS[id].fallbackPrice, status: 'loading' as PriceStatus }]),
    ) as Record<InstrumentId, { price: number; status: PriceStatus }>,
  )

  const [usdInr, setUsdInr] = useState<{ rate: number; status: PriceStatus }>({
    rate: FALLBACK_USD_INR,
    status: 'loading',
  })

  // null = follow the instrument's price; a string = the user typed their own.
  const [priceOverride, setPriceOverride] = useState<string | null>(null)
  const [pnlEntryOverride, setPnlEntryOverride] = useState<string | null>(null)
  const [leverage, setLeverage] = useState(DEFAULT_LEVERAGE)
  const [direction, setDirection] = useState<Direction>('BUY')
  const [lots, setLots] = useState(0.1)
  const [lotText, setLotText] = useState('0.10')
  const [exit, setExit] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [balance, setBalance] = useState('1000')
  const [slPoints, setSlPoints] = useState('20')

  useEffect(() => {
    let cancelled = false
    fetchLivePrices().then((live) => {
      if (cancelled) return
      setPrices((prev) => {
        const next = { ...prev }
        for (const id of INSTRUMENT_IDS) {
          const livePrice = live[id]
          next[id] = livePrice ? { price: livePrice, status: 'live' } : { ...prev[id], status: 'est' }
        }
        return next
      })
    })
    fetchUsdInr().then((rate) => {
      if (cancelled) return
      setUsdInr((prev) => (rate ? { rate, status: 'live' } : { ...prev, status: 'est' }))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const instrument = INSTRUMENTS[current]
  const price = parseFloat(priceOverride ?? '') || prices[current].price
  const entry = parseFloat(pnlEntryOverride ?? '') || price
  const liveCount = INSTRUMENT_IDS.filter((id) => prices[id].status === 'live').length
  const stillLoading = INSTRUMENT_IDS.some((id) => prices[id].status === 'loading')

  const marginResult = calcMargin(instrument, lots, price, leverage)
  const pnl = calcPnL({
    instrument,
    direction,
    lots,
    leverage,
    entry,
    exit: parseFloat(exit),
    stopLoss: parseFloat(stopLoss),
  })
  const risk = calcRisk(instrument, lots, parseFloat(balance) || 1000, parseFloat(slPoints) || 20)

  function selectInstrument(id: InstrumentId) {
    setCurrent(id)
    setLeverage(DEFAULT_LEVERAGE)
    // Prices differ wildly between instruments, so carrying over a typed
    // entry/TP/SL would produce nonsense numbers.
    setPriceOverride(null)
    setPnlEntryOverride(null)
    setExit('')
    setStopLoss('')
  }

  function chooseLots(value: number) {
    setLots(value)
    setLotText(value.toFixed(2))
  }

  function handleLotText(text: string) {
    setLotText(text)
    const value = parseFloat(text)
    if (value > 0) setLots(value)
  }

  const badgeText = stillLoading
    ? 'Fetching live prices…'
    : liveCount === INSTRUMENT_IDS.length
      ? 'Live prices'
      : liveCount > 0
        ? `${liveCount}/${INSTRUMENT_IDS.length} live · others estimated`
        : 'Manual mode — edit the entry price below'

  const inr = (usd: number) => toInr(usd, usdInr.rate)
  const riskPercentColor = risk.percent > 3 ? 'text-error' : risk.percent > 2 ? 'text-amber-500' : 'text-accent'

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text">MT5 Margin Calculator</h1>
        <p className="mt-1 text-sm text-text-secondary">XAUUSD · Bitcoin · US30 — margin, P&amp;L and risk.</p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-text-secondary">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              stillLoading ? 'animate-pulse bg-amber-500' : liveCount > 0 ? 'bg-accent' : 'bg-text-secondary/50',
            )}
          />
          {badgeText}
        </div>
        <div className="ml-2 mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-text-secondary">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              usdInr.status === 'loading' ? 'animate-pulse bg-amber-500' : usdInr.status === 'live' ? 'bg-accent' : 'bg-amber-500',
            )}
          />
          1 USD = ₹{fmt(usdInr.rate)}
          {usdInr.status === 'est' && ' (est)'}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {INSTRUMENT_IDS.map((id) => {
          const { price: p, status } = prices[id]
          return (
            <button
              key={id}
              type="button"
              data-cursor="hover"
              onClick={() => selectInstrument(id)}
              className={cn(
                'rounded-xl border px-2 py-2.5 text-center transition-colors',
                id === current
                  ? 'border-accent/60 bg-accent/10'
                  : 'border-border bg-surface-2 hover:border-accent/40',
              )}
            >
              <span className={cn('block text-sm font-bold', id === current ? 'text-accent' : 'text-text-secondary')}>
                {id}
              </span>
              <span className="mt-0.5 block font-mono text-xs text-text">{fmt(p, INSTRUMENTS[id].priceDecimals)}</span>
              <span
                className={cn(
                  'mt-0.5 block text-[10px]',
                  status === 'live' ? 'text-accent' : status === 'est' ? 'text-amber-500' : 'text-text-secondary/60',
                )}
              >
                {status === 'loading' ? 'loading' : `● ${status}`}
              </span>
            </button>
          )
        })}
      </div>

      <GlassCard hover={false} className="p-5">
        <SectionTitle>Trade setup</SectionTitle>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <Field label="Entry price (USD)">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={priceOverride ?? String(prices[current].price)}
              onChange={(e) => setPriceOverride(e.target.value)}
            />
          </Field>
          <Field label="Leverage">
            <select
              className={inputClass}
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
            >
              {LEVERAGE_OPTIONS.map((l) => (
                <option key={l} value={l} className="bg-card">
                  1 : {l}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-lg border border-border text-sm font-bold">
          {(['BUY', 'SELL'] as const).map((d) => (
            <button
              key={d}
              type="button"
              data-cursor="hover"
              onClick={() => setDirection(d)}
              className={cn(
                'py-2 transition-colors',
                direction === d
                  ? d === 'BUY'
                    ? 'bg-accent/15 text-accent'
                    : 'bg-error/15 text-error'
                  : 'bg-surface-2 text-text-secondary hover:text-text',
              )}
            >
              {d === 'BUY' ? '▲ BUY / LONG' : '▼ SELL / SHORT'}
            </button>
          ))}
        </div>

        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">Lot size</span>
          <input
            aria-label="Lot size"
            inputMode="decimal"
            value={lotText}
            onChange={(e) => handleLotText(e.target.value)}
            onBlur={() => setLotText(lots.toFixed(2))}
            className="w-24 rounded-md border border-border bg-surface-2 px-2 py-1 text-center font-mono text-base font-bold text-accent outline-none focus:border-accent/50"
          />
        </div>
        <input
          type="range"
          aria-label="Lot size slider"
          min={LOT_MIN}
          max={LOT_MAX}
          step={0.01}
          value={Math.min(lots, LOT_MAX)}
          onChange={(e) => chooseLots(parseFloat(e.target.value))}
          className="w-full cursor-pointer accent-accent"
        />
        <div className="mb-3 flex justify-between text-[10px] text-text-secondary/60">
          <span>0.01</span>
          <span>0.5</span>
          <span>1.0</span>
          <span>2.0</span>
          <span>5.0</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_LOTS.map((v) => (
            <button
              key={v}
              type="button"
              data-cursor="hover"
              onClick={() => chooseLots(v)}
              className={cn(
                'min-w-10 flex-1 rounded-md border py-1.5 text-xs transition-colors',
                lots === v
                  ? 'border-accent/60 bg-accent/10 text-accent'
                  : 'border-border bg-surface-2 text-text-secondary hover:border-accent/40',
              )}
            >
              {v.toFixed(2)}
            </button>
          ))}
        </div>

        <hr className="my-5 border-border" />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <Stat
            className="col-span-2 border-accent/40 bg-accent/5"
            label="Margin required"
            value={`$${fmt(marginResult.margin)}`}
            inr={inr(marginResult.margin)}
            sub={`at 1:${leverage} leverage`}
            valueClassName="text-3xl text-accent"
          />
          <Stat label="Position value" value={`$${fmt(marginResult.positionValue, 0)}`} inr={inr(marginResult.positionValue)} sub="Total exposure" />
          <Stat
            label="Point value"
            value={`$${fmt(marginResult.pointValue)}`}
            inr={inr(marginResult.pointValue)}
            sub="per 1 pt move"
            valueClassName="text-amber-500"
          />
        </div>
        <div className="space-y-1.5">
          <InfoRow label="Contract size" value={`${instrument.contractSize} ${instrument.unit}`} />
          <InfoRow
            label="Units traded"
            value={`${fmt(marginResult.units, instrument.priceDecimals === 0 ? 0 : 2)} ${instrument.unit}`}
          />
        </div>
      </GlassCard>

      <GlassCard hover={false} className="p-5">
        <SectionTitle>Profit / loss estimate</SectionTitle>

        <div className="mb-4 grid grid-cols-3 gap-3">
          <Field label="Entry">
            <input
              type="number"
              step="0.01"
              placeholder="same as above"
              className={inputClass}
              value={pnlEntryOverride ?? String(price)}
              onChange={(e) => setPnlEntryOverride(e.target.value)}
            />
          </Field>
          <Field label="Exit / target">
            <input
              type="number"
              step="0.01"
              placeholder="your TP"
              className={inputClass}
              value={exit}
              onChange={(e) => setExit(e.target.value)}
            />
          </Field>
          <Field label="Stop loss">
            <input
              type="number"
              step="0.01"
              placeholder="your SL"
              className={inputClass}
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
            />
          </Field>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <Stat
            label="✅ TP profit"
            value={signed(pnl.tpProfit)}
            inr={inr(pnl.tpProfit)}
            tax={
              pnl.tpProfit > 0
                ? `30% tax: -$${fmt(pnl.tpProfit * TAX_RATE)} (${inr(-pnl.tpProfit * TAX_RATE).replace('≈ ', '')})`
                : undefined
            }
            sub={`${fmt(Math.abs(pnl.tpPoints), 0)} pts`}
            valueClassName={pnl.tpProfit >= 0 ? 'text-accent' : 'text-error'}
          />
          <Stat
            label="❌ SL loss"
            value={`-$${fmt(pnl.slLoss)}`}
            inr={inr(-pnl.slLoss)}
            sub={`${fmt(Math.abs(pnl.slPoints), 0)} pts`}
            valueClassName="text-error"
          />
          <Stat
            label="ROI on margin"
            value={`${pnl.roi >= 0 ? '+' : ''}${fmt(pnl.roi, 1)}%`}
            sub="profit ÷ margin"
            valueClassName={pnl.roi >= 0 ? 'text-accent' : 'text-error'}
          />
          <Stat
            label="Risk : reward"
            value={pnl.riskReward ? `1 : ${fmt(pnl.riskReward)}` : '—'}
            sub="TP profit ÷ SL loss"
            valueClassName="text-sky-500"
          />
        </div>

        <InfoRow
          label="Direction"
          value={direction === 'BUY' ? 'BUY — profit when price rises ↑' : 'SELL — profit when price falls ↓'}
        />
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-7">
          <div
            className={cn('h-full rounded-full transition-all', pnl.roi >= 0 ? 'bg-accent' : 'bg-error')}
            style={{ width: `${Math.min(Math.abs(pnl.roi), 100)}%` }}
          />
        </div>
      </GlassCard>

      <GlassCard hover={false} className="p-5">
        <SectionTitle>Risk calculator</SectionTitle>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <Field label="Account balance (USD)">
            <input
              type="number"
              step="100"
              className={inputClass}
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
            <span className="font-mono text-[11px] text-text-secondary/60">{inr(parseFloat(balance) || 0)}</span>
          </Field>
          <Field label="SL in points">
            <input
              type="number"
              step="1"
              min="1"
              className={inputClass}
              value={slPoints}
              onChange={(e) => setSlPoints(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Dollar risk (SL hit)"
            value={`$${fmt(risk.dollarRisk)}`}
            inr={inr(risk.dollarRisk)}
            sub={`${fmt(risk.percent)}% of balance`}
            valueClassName="text-error"
          />
          <Stat label="Reward @ 1:2" value={`$${fmt(risk.reward)}`} inr={inr(risk.reward)} sub="if target = 2× SL" valueClassName="text-accent" />
        </div>
        <p className={cn('mt-2 text-center text-xs font-medium', riskPercentColor)}>
          {fmt(risk.percent)}% of balance at risk
        </p>

        <hr className="my-4 border-border" />
        <p className="text-xs leading-7 text-text-secondary">
          Max lot for <strong className="text-error">1% risk</strong> with this SL:{' '}
          <span className="font-mono font-bold text-text">{fmt(risk.maxLots1Percent)} lots</span>
          <br />
          Max lot for <strong className="text-amber-500">2% risk</strong>:{' '}
          <span className="font-mono font-bold text-text">{fmt(risk.maxLots2Percent)} lots</span>
        </p>
      </GlassCard>

      <p className="text-center text-[11px] leading-relaxed text-text-secondary/70">
        Margin = (Lots × Contract Size × Price) ÷ Leverage
        <br />
        P/L = (Exit − Entry) × Lots × Contract Size × Direction
        <br />
        Prices come from public APIs and may be delayed. Always verify with your broker.
      </p>
    </div>
  )
}
