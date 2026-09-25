import { useEffect, useState, type ReactNode } from 'react'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/utils'
import { ReportMenu } from '@/components/viz/ReportMenu'
import { marginReport } from '@/lib/moduleReports'
import { fetchLivePrices, fetchUsdInr } from '@/lib/livePrices'
import { loadMarginInputs, saveMarginInputs } from '@/lib/marginInputs'
import {
  CALIBRATION_LOTS,
  FALLBACK_USD_INR,
  TAX_RATE,
  afterTaxProfit,
  INSTRUMENTS,
  LEVERAGE_OPTIONS,
  LOT_MAX,
  LOT_MIN,
  calcMargin,
  calcPnL,
  calcRisk,
  impliedLeverage,
  type Direction,
  type InstrumentId,
} from '@/lib/margin'

type PriceStatus = 'loading' | 'live' | 'est'

const INSTRUMENT_IDS = Object.keys(INSTRUMENTS) as InstrumentId[]
const QUICK_LOTS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2]

const inputClass =
  'w-full min-w-0 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-sm text-text outline-none transition-colors focus:border-accent/50'

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
    <label className="flex min-w-0 flex-col gap-1">
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
  afterTax,
  className,
  valueClassName,
}: {
  label: string
  value: string
  inr?: string
  sub?: string
  tax?: string
  afterTax?: string
  className?: string
  valueClassName?: string
}) {
  return (
    // @container lets the numbers size themselves against this card's own width
    // (cqw), so a long value like $2,189,000 shrinks instead of overflowing when
    // the cards sit three across.
    <div className={cn('@container min-w-0 rounded-xl border border-border bg-surface-2 p-2.5 text-center', className)}>
      <p className="text-[11px] uppercase leading-tight tracking-wide text-text-secondary">{label}</p>
      <p
        className={cn(
          'mt-1 whitespace-nowrap font-mono text-[length:min(1.5rem,13cqw)] font-bold leading-tight text-text',
          valueClassName,
        )}
      >
        {value}
      </p>
      {inr && (
        <p className="mt-0.5 whitespace-nowrap font-mono text-[length:min(11px,10cqw)] text-text-secondary/60">{inr}</p>
      )}
      {tax && <p className="mt-0.5 font-mono text-[11px] leading-snug text-amber-500/80">{tax}</p>}
      {afterTax && (
        <p className="mt-1 border-t border-border pt-1 font-mono text-[11px] font-semibold leading-snug text-positive">
          {afterTax}
        </p>
      )}
      {sub && <p className="mt-0.5 text-[11px] leading-tight text-text-secondary/70">{sub}</p>}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs">
      <span className="text-text-secondary">{label}</span>
      <span className="font-mono font-semibold text-text">{value}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">{children}</h2>
}

export function MarginCalculator() {
  // Restore the last session's inputs so the page opens where it was left.
  const [saved] = useState(loadMarginInputs)
  const [current, setCurrent] = useState<InstrumentId>(saved.instrument)
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
  const [priceOverride, setPriceOverride] = useState<string | null>(saved.priceOverride)
  const [pnlEntryOverride, setPnlEntryOverride] = useState<string | null>(saved.pnlEntryOverride)
  const [leverage, setLeverage] = useState(saved.leverage)
  const [direction, setDirection] = useState<Direction>(saved.direction)
  const [lots, setLots] = useState(saved.lots)
  const [lotText, setLotText] = useState(saved.lots.toFixed(2))
  const [exit, setExit] = useState(saved.exit)
  const [stopLoss, setStopLoss] = useState(saved.stopLoss)
  const [balance, setBalance] = useState(saved.balance)
  const [slPoints, setSlPoints] = useState(saved.slPoints)
  // Kept per instrument: the margin the user's own broker shows for a CALIBRATION_LOTS position, e.g. "$10.31" for
  // 0.1 lot US30. When set, it stands in for the leverage dropdown so every figure on the page matches that broker.
  const [calibration, setCalibration] = useState(saved.calibration)

  useEffect(() => {
    saveMarginInputs({
      instrument: current,
      direction,
      lots,
      leverage,
      priceOverride,
      pnlEntryOverride,
      exit,
      stopLoss,
      balance,
      slPoints,
      calibration,
    })
  }, [current, direction, lots, leverage, priceOverride, pnlEntryOverride, exit, stopLoss, balance, slPoints, calibration])

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

  // If the user has typed what their broker actually charges for CALIBRATION_LOTS, that overrides the leverage
  // dropdown for this instrument — every figure below then matches that broker instead of a guessed leverage.
  const calibrationText = calibration[current] ?? ''
  const calibratedLeverage = impliedLeverage(instrument, price, parseFloat(calibrationText))
  const isCalibrated = calibratedLeverage !== null
  const effectiveLeverage = calibratedLeverage ?? leverage

  const marginResult = calcMargin(instrument, lots, price, effectiveLeverage)
  const pnl = calcPnL({
    instrument,
    direction,
    lots,
    leverage: effectiveLeverage,
    entry,
    exit: parseFloat(exit),
    stopLoss: parseFloat(stopLoss),
  })
  const risk = calcRisk(instrument, lots, parseFloat(balance) || 1000, parseFloat(slPoints) || 20)

  function selectInstrument(id: InstrumentId) {
    setCurrent(id)
    setLeverage(INSTRUMENTS[id].defaultLeverage)
    // Prices differ wildly between instruments, so carrying over a typed
    // entry/TP/SL would produce nonsense numbers.
    setPriceOverride(null)
    setPnlEntryOverride(null)
    setExit('')
    setStopLoss('')
  }

  function setCalibrationForCurrent(value: string) {
    setCalibration((prev) => {
      if (value) return { ...prev, [current]: value }
      if (!(current in prev)) return prev
      const next = { ...prev }
      delete next[current]
      return next
    })
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
  const riskPercentColor = risk.percent > 3 ? 'text-error' : risk.percent > 2 ? 'text-amber-500' : 'text-positive'

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 lg:flex-nowrap">
        <div className="order-1 min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold text-text">MT5 Margin Calculator</h1>
          <p className="mt-0.5 text-sm text-text-secondary">XAUUSD · Bitcoin · US30 — margin, P&amp;L and risk.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-text-secondary">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  stillLoading ? 'animate-pulse bg-amber-500' : liveCount > 0 ? 'bg-positive' : 'bg-text-secondary/50',
                )}
              />
              {badgeText}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-text-secondary">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  usdInr.status === 'loading'
                    ? 'animate-pulse bg-amber-500'
                    : usdInr.status === 'live'
                      ? 'bg-accent'
                      : 'bg-amber-500',
                )}
              />
              1 USD = ₹{fmt(usdInr.rate)}
              {usdInr.status === 'est' && ' (est)'}
            </div>
          </div>
        </div>

        <ReportMenu
          className="order-2 shrink-0 lg:order-3"
          filename="trade-plan-report"
          report={() =>
            marginReport({
              instrumentName: instrument.name,
              unit: instrument.unit,
              direction,
              lots,
              leverage: effectiveLeverage,
              entry,
              exit: parseFloat(exit) || null,
              stopLoss: parseFloat(stopLoss) || null,
              usdInr: usdInr.rate,
              margin: marginResult,
              pnl,
              risk,
              balance: parseFloat(balance) || 1000,
              slPointsInput: parseFloat(slPoints) || 20,
            })
          }
        />

        <div className="order-3 grid w-full grid-cols-3 gap-2 lg:order-2 lg:w-[26rem] lg:shrink-0">
          {INSTRUMENT_IDS.map((id) => {
            const { price: p, status } = prices[id]
            return (
              <button
                key={id}
                type="button"
                data-cursor="hover"
                onClick={() => selectInstrument(id)}
                className={cn(
                  'min-w-0 rounded-xl border px-2 py-1.5 text-center transition-colors',
                  id === current
                    ? 'border-accent/60 bg-accent/10'
                    : 'border-border bg-surface-2 hover:border-accent/40',
                )}
              >
                <span className={cn('block text-sm font-bold', id === current ? 'text-accent' : 'text-text-secondary')}>
                  {id}
                </span>
                <span className="block font-mono text-xs text-text">{fmt(p, INSTRUMENTS[id].priceDecimals)}</span>
                <span
                  className={cn(
                    'block text-[10px]',
                    status === 'live' ? 'text-accent' : status === 'est' ? 'text-amber-500' : 'text-text-secondary/60',
                  )}
                >
                  {status === 'loading' ? 'loading' : `● ${status}`}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Phones: one column. lg: setup on the left, P&L over Risk on the right.
          xl: all three cards side by side so everything fits in one view. */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <GlassCard hover={false} className="p-4 lg:row-span-2 xl:row-span-1">
          <SectionTitle>Trade setup</SectionTitle>

          <div className="mb-3 grid grid-cols-2 gap-2.5">
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
                className={cn(inputClass, isCalibrated && 'opacity-50')}
                disabled={isCalibrated}
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

          <div className="mb-3">
            <Field label={`Broker's margin for ${CALIBRATION_LOTS} lot (USD)`}>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="optional — e.g. 10.31"
                  className={inputClass}
                  value={calibrationText}
                  onChange={(e) => setCalibrationForCurrent(e.target.value)}
                />
                {calibrationText && (
                  <button
                    type="button"
                    data-cursor="hover"
                    onClick={() => setCalibrationForCurrent('')}
                    className="shrink-0 rounded-lg border border-border px-2.5 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
                  >
                    Clear
                  </button>
                )}
              </div>
            </Field>
            <p className="mt-1 text-[11px] leading-snug text-text-secondary">
              {calibrationText && !isCalibrated
                ? 'Enter a positive number to match every figure below to your broker.'
                : isCalibrated
                  ? `Matched to your broker — implies ≈1:${fmt(effectiveLeverage, effectiveLeverage >= 100 ? 0 : 1)} leverage, overriding the dropdown above.`
                  : "If your broker's app shows a different margin, enter it here and every number below will match it."}
            </p>
          </div>

          <div className="mb-3 grid grid-cols-2 overflow-hidden rounded-lg border border-border text-sm font-bold">
            {(['BUY', 'SELL'] as const).map((d) => (
              <button
                key={d}
                type="button"
                data-cursor="hover"
                onClick={() => setDirection(d)}
                className={cn(
                  'py-1.5 transition-colors',
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

          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">Lot size</span>
            <input
              aria-label="Lot size"
              inputMode="decimal"
              value={lotText}
              onChange={(e) => handleLotText(e.target.value)}
              onBlur={() => setLotText(lots.toFixed(2))}
              className="w-24 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-center font-mono text-base font-bold text-accent outline-none focus:border-accent/50"
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
          <div className="mb-2 flex justify-between text-[10px] text-text-secondary/60">
            <span>0.01</span>
            <span>0.5</span>
            <span>1.0</span>
            <span>2.0</span>
            <span>5.0</span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {QUICK_LOTS.map((v) => (
              <button
                key={v}
                type="button"
                data-cursor="hover"
                onClick={() => chooseLots(v)}
                className={cn(
                  'min-w-0 rounded-md border py-1 text-xs transition-colors',
                  lots === v
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-border bg-surface-2 text-text-secondary hover:border-accent/40',
                )}
              >
                {v.toFixed(2)}
              </button>
            ))}
          </div>

          <hr className="my-3 border-border" />

          <div className="mb-2.5 grid grid-cols-2 gap-2.5">
            <Stat
              className="col-span-2 border-accent/40 bg-accent/5"
              label="Margin required"
              value={`$${fmt(marginResult.margin)}`}
              inr={inr(marginResult.margin)}
              sub={
                isCalibrated
                  ? `at ≈1:${fmt(effectiveLeverage, effectiveLeverage >= 100 ? 0 : 1)} leverage (your broker)`
                  : `at 1:${effectiveLeverage} leverage`
              }
              valueClassName="text-[length:min(2rem,12cqw)] text-accent"
            />
            <Stat
              label="Position value"
              value={`$${fmt(marginResult.positionValue, 0)}`}
              inr={inr(marginResult.positionValue)}
              sub="Total exposure"
            />
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

        <GlassCard hover={false} className="p-4">
          <SectionTitle>Profit / loss estimate</SectionTitle>

          <div className="mb-3 grid grid-cols-3 gap-2">
            <Field label="Entry">
              <input
                type="number"
                step="0.01"
                placeholder="same as above"
                className={cn(inputClass, 'text-ellipsis')}
                value={pnlEntryOverride ?? String(price)}
                onChange={(e) => setPnlEntryOverride(e.target.value)}
              />
            </Field>
            <Field label="Exit / target">
              <input
                type="number"
                step="0.01"
                placeholder="your TP"
                className={cn(inputClass, 'text-ellipsis')}
                value={exit}
                onChange={(e) => setExit(e.target.value)}
              />
            </Field>
            <Field label="Stop loss">
              <input
                type="number"
                step="0.01"
                placeholder="your SL"
                className={cn(inputClass, 'text-ellipsis')}
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
              />
            </Field>
          </div>

          <div className="mb-2.5 grid grid-cols-2 gap-2.5">
            <Stat
              label="✅ TP profit"
              value={signed(pnl.tpProfit)}
              inr={inr(pnl.tpProfit)}
              tax={
                pnl.tpProfit > 0
                  ? `30% tax: -$${fmt(pnl.tpProfit * TAX_RATE)} (${inr(-pnl.tpProfit * TAX_RATE).replace('≈ ', '').replace('-', '\u2212')})`
                  : undefined
              }
              afterTax={
                pnl.tpProfit > 0
                  ? `After tax: ${signed(afterTaxProfit(pnl.tpProfit))} (${inr(afterTaxProfit(pnl.tpProfit)).replace('≈ ', '')})`
                  : undefined
              }
              sub={`${fmt(Math.abs(pnl.tpPoints), 0)} pts`}
              valueClassName={pnl.tpProfit >= 0 ? 'text-positive' : 'text-error'}
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
              valueClassName={pnl.roi >= 0 ? 'text-positive' : 'text-error'}
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
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-7">
            <div
              className={cn('h-full rounded-full transition-all', pnl.roi >= 0 ? 'bg-positive' : 'bg-error')}
              style={{ width: `${Math.min(Math.abs(pnl.roi), 100)}%` }}
            />
          </div>
        </GlassCard>

        <GlassCard hover={false} className="p-4">
          <SectionTitle>Risk calculator</SectionTitle>

          <div className="mb-3 grid grid-cols-2 gap-2.5">
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

          <div className="grid grid-cols-2 gap-2.5">
            <Stat
              label="Dollar risk (SL hit)"
              value={`$${fmt(risk.dollarRisk)}`}
              inr={inr(risk.dollarRisk)}
              sub={`${fmt(risk.percent)}% of balance`}
              valueClassName="text-error"
            />
            <Stat
              label="Reward @ 1:2"
              value={`$${fmt(risk.reward)}`}
              inr={inr(risk.reward)}
              sub="if target = 2× SL"
              valueClassName="text-accent"
            />
          </div>
          <p className={cn('mt-2 text-center text-xs font-medium', riskPercentColor)}>
            {fmt(risk.percent)}% of balance at risk
          </p>

          <hr className="my-3 border-border" />
          <p className="text-xs leading-6 text-text-secondary">
            Max lot for <strong className="text-error">1% risk</strong> with this SL:{' '}
            <span className="font-mono font-bold text-text">{fmt(risk.maxLots1Percent)} lots</span>
            <br />
            Max lot for <strong className="text-amber-500">2% risk</strong>:{' '}
            <span className="font-mono font-bold text-text">{fmt(risk.maxLots2Percent)} lots</span>
          </p>
        </GlassCard>
      </div>

      <p className="text-center text-[11px] leading-relaxed text-text-secondary/70">
        Margin = (Lots × Contract Size × Price) ÷ Leverage · P/L = (Exit − Entry) × Lots × Contract Size × Direction ·
        Prices come from public APIs and may be delayed. Always verify with your broker.
      </p>
    </div>
  )
}
