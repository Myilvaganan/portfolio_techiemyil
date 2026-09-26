import { describe, expect, it } from 'vitest'
import { positionSize } from './positionSizing'

describe('positionSize', () => {
  it('sizes a trade to the risk budget, rounding down to whole lots', () => {
    // ₹1,00,000 account, risk 1% = ₹1,000. Entry 100, stop 90 → ₹10 risk per share. Lot size 25.
    const r = positionSize({ accountSize: 100000, riskPct: 1, entry: 100, stopLoss: 90, lotSize: 25 })
    expect(r).not.toBeNull()
    expect(r!.riskAmount).toBe(1000)
    expect(r!.riskPerUnit).toBe(10)
    // maxQty = 100, lots = floor(100/25) = 4 lots = 100 qty
    expect(r!.lots).toBe(4)
    expect(r!.qty).toBe(100)
    expect(r!.rupeesAtRisk).toBe(1000)
  })

  it('handles a lot size of 1 (shares) and rounds down partial lots', () => {
    const r = positionSize({ accountSize: 50000, riskPct: 2, entry: 500, stopLoss: 480, lotSize: 1 })
    // risk amount 1000, risk per unit 20 → maxQty 50
    expect(r).toMatchObject({ riskAmount: 1000, riskPerUnit: 20, lots: 50, qty: 50, rupeesAtRisk: 1000 })
  })

  it('does not care whether the stop is above or below entry (short or long)', () => {
    const long = positionSize({ accountSize: 100000, riskPct: 1, entry: 100, stopLoss: 90, lotSize: 1 })
    const short = positionSize({ accountSize: 100000, riskPct: 1, entry: 100, stopLoss: 110, lotSize: 1 })
    expect(long!.riskPerUnit).toBe(short!.riskPerUnit)
  })

  it('is null when the budget cannot afford even one lot', () => {
    const r = positionSize({ accountSize: 1000, riskPct: 1, entry: 100, stopLoss: 50, lotSize: 25 })
    expect(r!.lots).toBe(0)
    expect(r!.qty).toBe(0)
    expect(r!.rupeesAtRisk).toBe(0)
  })

  it('is null for a zero or negative account size, risk %, lot size, or an entry equal to the stop', () => {
    expect(positionSize({ accountSize: 0, riskPct: 1, entry: 100, stopLoss: 90, lotSize: 1 })).toBeNull()
    expect(positionSize({ accountSize: 100000, riskPct: 0, entry: 100, stopLoss: 90, lotSize: 1 })).toBeNull()
    expect(positionSize({ accountSize: 100000, riskPct: 1, entry: 100, stopLoss: 90, lotSize: 0 })).toBeNull()
    expect(positionSize({ accountSize: 100000, riskPct: 1, entry: 100, stopLoss: 100, lotSize: 1 })).toBeNull()
  })
})
