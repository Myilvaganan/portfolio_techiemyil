import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDismissedNotices } from './dismissed'
import type { Notice } from './pulse'

const emi = (days: number): Notice => ({ id: 'emi', tone: 'warn', title: `EMI due in ${days} days`, detail: 'Personal loan', to: '/loans' })

describe('dismissed notices', () => {
  it('hides a closed alert but shows the next one of the same kind, and can restore all', () => {
    const { result } = renderHook(() => useDismissedNotices())
    act(() => result.current.dismiss(emi(4)))
    expect(result.current.visible([emi(4)])).toEqual([])
    expect(result.current.visible([emi(3)])).toHaveLength(1)
    act(() => result.current.restoreAll())
    expect(result.current.visible([emi(4)])).toHaveLength(1)
  })
})
