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
})
