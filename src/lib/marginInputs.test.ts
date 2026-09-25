import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_INPUTS, loadMarginInputs, saveMarginInputs } from './marginInputs'

const KEY = 'margin-calculator-inputs'

describe('marginInputs', () => {
  afterEach(() => localStorage.clear())

  it('returns the defaults when nothing is saved', () => {
    expect(loadMarginInputs()).toEqual(DEFAULT_INPUTS)
  })

  it('round-trips saved inputs', () => {
    const inputs = { ...DEFAULT_INPUTS, instrument: 'BITCOIN' as const, direction: 'SELL' as const, lots: 0.5, exit: '60000' }
    saveMarginInputs(inputs)
    expect(loadMarginInputs()).toEqual(inputs)
  })

  it('falls back to the defaults for corrupt JSON', () => {
    localStorage.setItem(KEY, '{nope')
    expect(loadMarginInputs()).toEqual(DEFAULT_INPUTS)
  })

  it('replaces only the invalid fields and keeps the valid ones', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ instrument: 'DOGE', direction: 'SELL', lots: -3, leverage: 7, exit: 42, balance: '5000' }),
    )
    expect(loadMarginInputs()).toEqual({ ...DEFAULT_INPUTS, direction: 'SELL', balance: '5000' })
  })

  describe('per-instrument calibration', () => {
    it('round-trips a broker margin saved for one instrument', () => {
      const inputs = { ...DEFAULT_INPUTS, calibration: { US30: '10.31' } }
      saveMarginInputs(inputs)
      expect(loadMarginInputs()).toEqual(inputs)
    })

    it('keeps a value per instrument independently', () => {
      const inputs = { ...DEFAULT_INPUTS, calibration: { US30: '10.31', XAUUSD: '4.30' } }
      saveMarginInputs(inputs)
      expect(loadMarginInputs().calibration).toEqual({ US30: '10.31', XAUUSD: '4.30' })
    })

    it('drops an unknown instrument key and a non-string value, keeping the rest', () => {
      localStorage.setItem(KEY, JSON.stringify({ ...DEFAULT_INPUTS, calibration: { DOGE: '5', US30: 10.31, XAUUSD: '4.30' } }))
      expect(loadMarginInputs().calibration).toEqual({ XAUUSD: '4.30' })
    })

    it('defaults to an empty map when missing or malformed', () => {
      localStorage.setItem(KEY, JSON.stringify({ ...DEFAULT_INPUTS, calibration: 'not an object' }))
      expect(loadMarginInputs().calibration).toEqual({})
    })
  })
})
