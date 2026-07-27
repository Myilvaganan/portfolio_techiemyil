import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLockBodyScroll } from './useLockBodyScroll'

describe('useLockBodyScroll', () => {
  it('sets body overflow to hidden when locked', () => {
    document.body.style.overflow = ''
    renderHook(() => useLockBodyScroll(true))
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('leaves body overflow untouched when not locked', () => {
    document.body.style.overflow = 'auto'
    renderHook(() => useLockBodyScroll(false))
    expect(document.body.style.overflow).toBe('auto')
  })

  it('restores the previous overflow value on unmount', () => {
    document.body.style.overflow = 'scroll'
    const { unmount } = renderHook(() => useLockBodyScroll(true))
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('restores the previous overflow value when locked flips back to false', () => {
    document.body.style.overflow = 'scroll'
    const { rerender } = renderHook(({ locked }) => useLockBodyScroll(locked), {
      initialProps: { locked: true },
    })
    expect(document.body.style.overflow).toBe('hidden')

    rerender({ locked: false })
    expect(document.body.style.overflow).toBe('scroll')
  })
})
