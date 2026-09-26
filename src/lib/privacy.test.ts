import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { CurrencyProvider, MASK, makeMoney, setHidden, symbolFor, useMoney, usePrivacy } from './privacy'

describe('makeMoney', () => {
  it('formats amounts when visible', () => {
    const m = makeMoney(false)
    expect(m.inr(12345)).toBe('₹12,345')
    expect(m.signed(-500)).toBe('-₹500')
    expect(m.signed(500)).toBe('+₹500')
    expect(m.pct(12.345)).toBe('12.3%')
    expect(m.axis(25000)).toBe('25k')
    expect(m.compact(1250)).toBe('+1.3k')
    expect(m.compact(-150000)).toBe('-1.5L')
  })

  it('replaces every amount with stars when hidden, keeping only the sign', () => {
    const m = makeMoney(true)
    expect(m.inr(12345)).toBe(`₹${MASK}`)
    expect(m.signed(-500)).toBe(`-₹${MASK}`)
    expect(m.signed(500)).toBe(`+₹${MASK}`)
    expect(m.signed(0)).toBe(`₹${MASK}`)
    expect(m.pct(12.3)).toBe(`${MASK}%`)
    expect(m.axis(25000)).toBe('*')
    expect(m.compact(-150000)).toBe(MASK)
    expect(m.inr(12345)).not.toMatch(/\d/)
  })
})

describe('usePrivacy', () => {
  afterEach(() => {
    act(() => setHidden(false))
    localStorage.clear()
  })

  it('toggles, remembers the choice and updates every consumer', () => {
    const a = renderHook(() => usePrivacy())
    const b = renderHook(() => useMoney())

    expect(a.result.current.hidden).toBe(false)
    expect(b.result.current.inr(100)).toBe('₹100')

    act(() => a.result.current.toggle())

    expect(a.result.current.hidden).toBe(true)
    expect(b.result.current.inr(100)).toBe(`₹${MASK}`)
    expect(localStorage.getItem('journal_hide_numbers')).toBe('1')
  })
})

describe('makeMoney in another currency (a Forex account)', () => {
  const usd = makeMoney(false, 'USD')

  it('shows dollars with cents, because a single trade can be worth $0.35', () => {
    expect(usd.inr(0.35)).toBe('$0.35')
    expect(usd.inr(1234.5)).toBe('$1,234.50')
    expect(usd.signed(-9.27)).toBe('-$9.27')
    expect(usd.signed(11.21)).toBe('+$11.21')
    expect(usd.signed(0)).toBe('$0.00')
  })

  it('keeps small amounts readable in tight spaces such as calendar cells', () => {
    expect(usd.compact(0.35)).toBe('+0.35')
    expect(usd.compact(-9.27)).toBe('-9.27')
    expect(usd.compact(35.9)).toBe('+35.9')
    expect(usd.compact(-125.11)).toBe('-125')
    expect(usd.compact(1250)).toBe('+1.3k')
    expect(usd.compact(48000)).toBe('+48k')
    expect(usd.compact(2_500_000)).toBe('+2.5M')
  })

  it('labels chart axes compactly too', () => {
    expect(usd.axis(0)).toBe('0')
    expect(usd.axis(-45)).toBe('-45.0')
    expect(usd.axis(3100)).toBe('3.1k')
  })

  it('stars out every amount in hidden mode, keeping the currency symbol and the sign', () => {
    const hidden = makeMoney(true, 'USD')
    expect(hidden.inr(1234.5)).toBe(`$${MASK}`)
    expect(hidden.signed(-9.27)).toBe(`-$${MASK}`)
    expect(hidden.signed(11.21)).toBe(`+$${MASK}`)
    expect(hidden.compact(-125)).toBe(MASK)
    expect(hidden.axis(45)).toBe('*')
    expect(hidden.inr(1234.5)).not.toMatch(/\d/)
  })

  it('uses the right symbol for other currencies, and the code when there is none', () => {
    expect(symbolFor('EUR')).toBe('€')
    expect(symbolFor('GBP')).toBe('£')
    expect(makeMoney(false, 'EUR').inr(5)).toBe('€5.00')
    expect(makeMoney(false, 'XYZ').inr(5)).toBe('XYZ 5.00')
  })

  it('leaves rupee formatting untouched by default', () => {
    expect(makeMoney(false).inr(12345)).toBe('₹12,345')
    expect(makeMoney(false).currency).toBe('INR')
    expect(makeMoney(false).symbol).toBe('₹')
  })
})

describe('CurrencyProvider', () => {
  afterEach(() => {
    act(() => setHidden(false))
    localStorage.clear()
  })

  it('switches every consumer beneath it to the account currency', () => {
    const wrapper = ({ children }: { children: ReactNode }) => createElement(CurrencyProvider, { value: 'USD' }, children)
    const { result } = renderHook(() => useMoney(), { wrapper })
    expect(result.current.inr(9.27)).toBe('$9.27')
  })

  it('defaults to rupees with no provider', () => {
    const { result } = renderHook(() => useMoney())
    expect(result.current.inr(9)).toBe('₹9')
  })
})

