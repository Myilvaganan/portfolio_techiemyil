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
}

export const INSTRUMENTS: Record<InstrumentId, Instrument> = {
  XAUUSD: { name: 'Gold / USD', contractSize: 100, fallbackPrice: 4378, tick: 0.01, unit: 'oz', priceDecimals: 2 },
  BITCOIN: { name: 'Bitcoin / USD', contractSize: 1, fallbackPrice: 63000, tick: 1, unit: 'BTC', priceDecimals: 0 },
  US30: { name: 'Dow Jones / USD', contractSize: 1, fallbackPrice: 41500, tick: 1, unit: 'idx', priceDecimals: 0 },
}

export const LEVERAGE_OPTIONS = [10, 20, 50, 100, 200, 500, 1000] as const
export const DEFAULT_LEVERAGE = 1000

/** Shown (marked as estimated) until the live USD→INR rate arrives or if it can't be fetched. */
export const FALLBACK_USD_INR = 96

export const LOT_MIN = 0.01
export const LOT_MAX = 5

/** Money made or lost per 1-point move at the given lot size. */
export function pointValue(instrument: Instrument, lots: number): number {
  return lots * instrument.contractSize * instrument.tick
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
