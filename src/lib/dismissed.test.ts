import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDismissedNotices } from './dismissed'
import type { Notice } from './pulse'

const emi = (days: number): Notice => ({ id: 'emi', tone: 'warn', title: `EMI due in ${days} days`, detail: 'Personal loan', to: '/loans' })

describe('dismissed notices', () => {
  it('keeps a closed alert hidden even as its countdown changes, clears all at once, and can restore all', () => {
    const { result } = renderHook(() => useDismissedNotices())
    act(() => result.current.dismiss(emi(4)))
    expect(result.current.visible([emi(4)])).toEqual([])
    expect(result.current.visible([emi(3)])).toEqual([])
    const card: Notice = { id: 'card', tone: 'warn', title: 'Card bill due', detail: '₹5,000', to: '/credit-cards' }
    act(() => result.current.dismissAll([card]))
    expect(result.current.visible([card, emi(2)])).toEqual([])
    act(() => result.current.restoreAll())
    expect(result.current.visible([emi(4)])).toHaveLength(1)
  })
})
