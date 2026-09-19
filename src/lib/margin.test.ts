import { describe, expect, it } from 'vitest'
import { INSTRUMENTS, calcMargin, calcPnL, calcRisk, pointValue } from './margin'

const GOLD = INSTRUMENTS.XAUUSD
const BTC = INSTRUMENTS.BITCOIN

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
