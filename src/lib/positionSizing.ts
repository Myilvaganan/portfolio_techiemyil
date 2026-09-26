// Options position-sizing: how many lots/quantity to trade so a stopped-out loss stays within a chosen risk budget.

export interface PositionSizeInput {
  /** Total account size, in rupees. */
  accountSize: number
  /** Percent of the account willing to be risked on this trade. */
  riskPct: number
  /** Entry price. */
  entry: number
  /** Stop-loss price. */
  stopLoss: number
  /** Units per lot (1 for plain shares/options bought per share). */
  lotSize: number
}

export interface PositionSizeResult {
  /** Rupees the risk % implies for this trade. */
  riskAmount: number
  /** Rupees at risk per single unit (share/contract), before lot size. */
  riskPerUnit: number
  /** Whole lots that fit inside the risk budget. */
  lots: number
  /** Quantity implied by those lots (lots × lotSize). */
  qty: number
  /** Rupees actually at risk at that quantity (qty × riskPerUnit) — at or under riskAmount. */
  rupeesAtRisk: number
}

/** Null when the inputs can't produce a sizing (no risk, or entry === stopLoss). */
export function positionSize(input: PositionSizeInput): PositionSizeResult | null {
  const { accountSize, riskPct, entry, stopLoss, lotSize } = input
  if (!(accountSize > 0) || !(riskPct > 0) || !(lotSize > 0)) return null
  const riskPerUnit = Math.abs(entry - stopLoss)
  if (!(riskPerUnit > 0)) return null

  const riskAmount = (accountSize * riskPct) / 100
  const maxQty = riskAmount / riskPerUnit
  const lots = Math.floor(maxQty / lotSize)
  const qty = lots * lotSize
  const rupeesAtRisk = qty * riskPerUnit

  return { riskAmount, riskPerUnit, lots, qty, rupeesAtRisk }
}
