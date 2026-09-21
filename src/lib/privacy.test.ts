import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { MASK, makeMoney, setHidden, useMoney, usePrivacy } from './privacy'

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
