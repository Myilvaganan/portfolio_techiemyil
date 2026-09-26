import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIdleLock } from './useIdleLock'
import * as privacy from '@/lib/privacy'

describe('useIdleLock', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('hides numbers after the short idle time and signs out after the long one', () => {
    const hide = vi.spyOn(privacy, 'setHidden')
    const lock = vi.fn()
    renderHook(() => useIdleLock(lock, { hideAfter: 60_000, lockAfter: 120_000 }))
    vi.advanceTimersByTime(75_000)
    expect(hide).toHaveBeenCalledWith(true)
    expect(lock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(lock).toHaveBeenCalledTimes(1)
  })

  it('activity resets the clock', () => {
    const lock = vi.fn()
    renderHook(() => useIdleLock(lock, { hideAfter: 60_000, lockAfter: 120_000 }))
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(45_000)
      window.dispatchEvent(new Event('keydown'))
    }
    expect(lock).not.toHaveBeenCalled()
  })
})
