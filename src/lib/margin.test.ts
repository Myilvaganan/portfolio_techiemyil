import { describe, expect, it } from 'vitest'
import { INSTRUMENTS, afterTaxProfit, calcMargin, calcPnL, calcRisk, impliedLeverage, pointValue } from './margin'

const GOLD = INSTRUMENTS.XAUUSD
const BTC = INSTRUMENTS.BITCOIN
const US30 = INSTRUMENTS.US30

describe('calcMargin', () => {
  it('computes margin as lots × contract × price ÷ leverage', () => {
    const r = calcMargin(GOLD, 0.1, 4378, 1000)
    expect(r.positionValue).toBeCloseTo(43780)
    expect(r.margin).toBeCloseTo(43.78)
    expect(r.units).toBeCloseTo(10)
  })

  it('scales margin down as leverage goes up', () => {
    expect(calcMargin(BTC, 1, 60000, 100).margin).toBe(600)
    expect(calcMargin(BTC, 1, 60000, 500).margin).toBe(120)
  })

  it('matches a real broker: 0.1 lot US30 at its default 1:500 leverage needs about $10', () => {
    expect(US30.defaultLeverage).toBe(500)
    expect(calcMargin(US30, 0.1, US30.fallbackPrice, US30.defaultLeverage).margin).toBeCloseTo(10)
  })
})

describe('impliedLeverage', () => {
  it('backs out the leverage a broker screenshot implies, e.g. $10.31 for 0.1 lot US30 at 51,523.50', () => {
    // 0.1 × 1 × 51523.50 ÷ 10.31 ≈ 499.7 — the broker's real 1:500.
    expect(impliedLeverage(US30, 51523.5, 10.31)).toBeCloseTo(499.74, 1)
  })

  it('matches calcMargin exactly when fed back in: the round trip reproduces the broker figure', () => {
    const leverage = impliedLeverage(GOLD, 4300, 4.3)!
    expect(calcMargin(GOLD, 0.1, 4300, leverage).margin).toBeCloseTo(4.3, 6)
  })

  it('scales correctly to other lot sizes once calibrated', () => {
    const leverage = impliedLeverage(US30, 51523.5, 10.31)!
    expect(calcMargin(US30, 1, 51523.5, leverage).margin).toBeCloseTo(103.1, 1)
    expect(calcMargin(US30, 0.01, 51523.5, leverage).margin).toBeCloseTo(1.031, 2)
  })

  it('is null for a margin that is zero, negative or not a number', () => {
    expect(impliedLeverage(GOLD, 4300, 0)).toBeNull()
    expect(impliedLeverage(GOLD, 4300, -5)).toBeNull()
    expect(impliedLeverage(GOLD, 4300, NaN)).toBeNull()
  })

  it('is null without a price yet', () => {
    expect(impliedLeverage(GOLD, 0, 4.3)).toBeNull()
    expect(impliedLeverage(GOLD, NaN, 4.3)).toBeNull()
  })

  it('rejects a margin so small it implies an unreasonable leverage', () => {
    expect(impliedLeverage(GOLD, 4300, 0.00001)).toBeNull()
  })

  it('rejects a margin so large it implies leverage under 1:1 (more margin than the position is worth)', () => {
    expect(impliedLeverage(GOLD, 4300, 1_000_000)).toBeNull()
  })
})

describe('instrument default leverage', () => {
  it('caps indices below gold and Bitcoin, which trade at full 1:1000', () => {
    expect(GOLD.defaultLeverage).toBe(1000)
    expect(BTC.defaultLeverage).toBe(1000)
    expect(US30.defaultLeverage).toBe(500)
  })
})

describe('pointValue', () => {
  it('is lots × contract size × tick', () => {
    expect(pointValue(GOLD, 0.1)).toBeCloseTo(0.1)
    expect(pointValue(BTC, 2)).toBe(2)
  })
})

describe('calcPnL', () => {
  const base = { instrument: GOLD, lots: 0.1, leverage: 1000, entry: 4378, exit: NaN, stopLoss: NaN }

  it('makes a profit on a BUY when price rises to target', () => {
    const r = calcPnL({ ...base, direction: 'BUY', exit: 4388 })
    expect(r.tpPoints).toBeCloseTo(1000)
    expect(r.tpProfit).toBeCloseTo(100)
    expect(r.roi).toBeCloseTo((100 / 43.78) * 100)
  })

  it('makes a profit on a SELL when price falls to target', () => {
    const r = calcPnL({ ...base, direction: 'SELL', exit: 4368 })
    expect(r.tpProfit).toBeCloseTo(100)
  })

  it('reports a negative profit when the target is on the wrong side', () => {
    const r = calcPnL({ ...base, direction: 'BUY', exit: 4368 })
    expect(r.tpProfit).toBeCloseTo(-100)
    expect(r.roi).toBeLessThan(0)
    expect(r.riskReward).toBeNull()
  })

  it('computes SL loss as a positive amount and the risk:reward ratio', () => {
    const r = calcPnL({ ...base, direction: 'BUY', exit: 4388, stopLoss: 4373 })
    expect(r.slLoss).toBeCloseTo(50)
    expect(r.riskReward).toBeCloseTo(2)
  })

  it('returns zeros when neither target nor stop is set', () => {
    const r = calcPnL({ ...base, direction: 'BUY' })
    expect(r).toEqual({ tpPoints: 0, tpProfit: 0, slPoints: 0, slLoss: 0, roi: 0, riskReward: null })
  })
})

describe('calcRisk', () => {
  it('computes dollar risk, percent of balance and 1:2 reward', () => {
    const r = calcRisk(GOLD, 0.1, 1000, 20)
    expect(r.dollarRisk).toBeCloseTo(2)
    expect(r.percent).toBeCloseTo(0.2)
    expect(r.reward).toBeCloseTo(4)
  })

  it('sizes the max lot so that the stop-loss risks exactly 1% / 2%', () => {
    const r = calcRisk(GOLD, 0.1, 1000, 20)
    expect(calcRisk(GOLD, r.maxLots1Percent, 1000, 20).percent).toBeCloseTo(1)
    expect(calcRisk(GOLD, r.maxLots2Percent, 1000, 20).percent).toBeCloseTo(2)
  })
})

describe('afterTaxProfit', () => {
  it('withholds 30% of a gain', () => {
    expect(afterTaxProfit(100)).toBeCloseTo(70)
  })

  it('leaves a loss or zero unchanged', () => {
    expect(afterTaxProfit(-50)).toBe(-50)
    expect(afterTaxProfit(0)).toBe(0)
  })
})
