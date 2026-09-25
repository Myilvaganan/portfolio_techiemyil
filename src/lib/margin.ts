export type InstrumentId = 'XAUUSD' | 'BITCOIN' | 'US30'
export type Direction = 'BUY' | 'SELL'

export interface Instrument {
  name: string
  contractSize: number
  /** Used until a live price arrives, and whenever a live fetch fails. */
  fallbackPrice: number
  /** Smallest price step that counts as one "point". */
  tick: number
  unit: string
  priceDecimals: number
  /** Leverage selected when this instrument is chosen. Brokers commonly cap indices lower than forex/gold. */
  defaultLeverage: number
}

export const INSTRUMENTS: Record<InstrumentId, Instrument> = {
  XAUUSD: { name: 'Gold / USD', contractSize: 100, fallbackPrice: 4300, tick: 0.01, unit: 'oz', priceDecimals: 2, defaultLeverage: 1000 },
  BITCOIN: { name: 'Bitcoin / USD', contractSize: 1, fallbackPrice: 63000, tick: 1, unit: 'BTC', priceDecimals: 0, defaultLeverage: 1000 },
  // Index CFDs are typically capped well below forex/gold leverage (e.g. 1:500 rather than 1:1000).
  US30: { name: 'Dow Jones / USD', contractSize: 1, fallbackPrice: 50000, tick: 1, unit: 'idx', priceDecimals: 0, defaultLeverage: 500 },
}

export const LEVERAGE_OPTIONS = [10, 20, 50, 100, 200, 500, 1000] as const
export const DEFAULT_LEVERAGE = 1000

/** Shown (marked as estimated) until the live USD→INR rate arrives or if it can't be fetched. */
export const FALLBACK_USD_INR = 96

export const LOT_MIN = 0.01
export const LOT_MAX = 5

/** Tax withheld from a winning trade's profit. */
export const TAX_RATE = 0.3

/** Profit after tax. Only gains are taxed; a loss is returned unchanged. */
export function afterTaxProfit(profit: number): number {
  return profit > 0 ? profit * (1 - TAX_RATE) : profit
}

/** Money made or lost per 1-point move at the given lot size. */
export function pointValue(instrument: Instrument, lots: number): number {
  return lots * instrument.contractSize * instrument.tick
}

/** The lot size a broker's app typically shows a margin figure for, e.g. "Required Margin $10.31" at 0.1 lot. */
export const CALIBRATION_LOTS = 0.1

const MIN_IMPLIED_LEVERAGE = 1
const MAX_IMPLIED_LEVERAGE = 100_000

/**
 * Backs out the leverage a broker must be using from the margin it actually shows for `CALIBRATION_LOTS`, so every
 * calculation on the page then matches that broker exactly instead of a guessed leverage. Returns null for an
 * input that can't imply a sane leverage (zero/negative margin, or no price yet).
 */
export function impliedLeverage(instrument: Instrument, price: number, brokerMargin: number): number | null {
  if (!(price > 0) || !(brokerMargin > 0)) return null
  const leverage = (CALIBRATION_LOTS * instrument.contractSize * price) / brokerMargin
  return leverage >= MIN_IMPLIED_LEVERAGE && leverage <= MAX_IMPLIED_LEVERAGE ? leverage : null
}

export function calcMargin(instrument: Instrument, lots: number, price: number, leverage: number) {
  const positionValue = lots * instrument.contractSize * price
  return {
    positionValue,
    margin: positionValue / leverage,
    pointValue: pointValue(instrument, lots),
    units: lots * instrument.contractSize,
  }
}

export interface PnLInput {
  instrument: Instrument
  direction: Direction
  lots: number
  leverage: number
  entry: number
  /** Take-profit price; NaN or <= 0 means "not set". */
  exit: number
  /** Stop-loss price; NaN or <= 0 means "not set". */
  stopLoss: number
}

export function calcPnL({ instrument, direction, lots, leverage, entry, exit, stopLoss }: PnLInput) {
  const dir = direction === 'BUY' ? 1 : -1
  const perPoint = pointValue(instrument, lots)
  const { margin } = calcMargin(instrument, lots, entry, leverage)

  let tpPoints = 0
  let tpProfit = 0
  if (exit > 0) {
    tpPoints = ((exit - entry) / instrument.tick) * dir
    tpProfit = tpPoints * perPoint
  }

  let slPoints = 0
  let slLoss = 0
  if (stopLoss > 0) {
    slPoints = ((entry - stopLoss) / instrument.tick) * dir
    slLoss = Math.abs(slPoints) * perPoint
  }

  const roi = margin > 0 && tpProfit !== 0 ? (tpProfit / margin) * 100 : 0
  const riskReward = slLoss > 0 && tpProfit > 0 ? tpProfit / slLoss : null

  return { tpPoints, tpProfit, slPoints, slLoss, roi, riskReward }
}

export function calcRisk(instrument: Instrument, lots: number, balance: number, slPoints: number) {
  const dollarRisk = pointValue(instrument, lots) * slPoints
  const perLotPointValue = instrument.contractSize * instrument.tick
  return {
    dollarRisk,
    percent: (dollarRisk / balance) * 100,
    reward: dollarRisk * 2,
    maxLots1Percent: (balance * 0.01) / (slPoints * perLotPointValue),
    maxLots2Percent: (balance * 0.02) / (slPoints * perLotPointValue),
  }
}
