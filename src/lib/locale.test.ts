import { afterEach, describe, expect, it } from 'vitest'
import { formatInr, formatSignedInr } from './kite'
import { translate } from './i18n'
import { displayCurrency, setLocale, setRates } from './locale'
import { makeMoney } from './privacy'

const RATES = { perInr: { INR: 1, USD: 0.012, EUR: 0.011, GBP: 0.0095, AED: 0.044, SGD: 0.0155 } }

describe('display currency and region', () => {
  afterEach(() => {
    localStorage.clear()
    setLocale({ language: 'en', region: 'IN', currency: 'INR' })
  })

  it('shows plain rupees with Indian grouping by default', () => {
    expect(formatInr(1234567)).toBe('₹12,34,567')
    expect(formatSignedInr(-500)).toBe('-₹500')
  })

  it('groups in millions for a non-Indian region while still in rupees', () => {
    setLocale({ region: 'US', currency: 'INR' })
    expect(formatInr(1234567)).toBe('₹1,234,567')
  })

  it('stays in rupees until a rate is known, instead of showing a wrong number', () => {
    setLocale({ currency: 'USD' })
    expect(displayCurrency()).toBe('INR')
    expect(formatInr(1000)).toBe('₹1,000')
  })

  it('converts once a rate is known, in formatInr and in the money helper', () => {
    setRates(RATES.perInr)
    setLocale({ region: 'US', currency: 'USD' })
    expect(displayCurrency()).toBe('USD')
    expect(formatInr(100000)).toBe('$1,200')
    expect(formatInr(500)).toBe('$6.00')
    const m = makeMoney(false, 'INR')
    expect(m.signed(-100000)).toBe('-$1,200.00')
    expect(m.compact(250000)).toBe('+3.0k')
    setRates({})
  })

  it('falls back to English for a Tamil key that is not translated yet', () => {
    expect(translate('nav.budgets', undefined, 'ta')).toBe('பட்ஜெட்')
    expect(translate('common.save', undefined, 'ta')).toBe('சேமி')
    // makeMoney keeps working for foreign books regardless of the display currency.
    expect(makeMoney(false, 'USD').signed(-12.5)).toBe('-$12.50')
  })
})
