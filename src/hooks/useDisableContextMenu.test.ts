import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDisableContextMenu } from './useDisableContextMenu'

describe('useDisableContextMenu', () => {
  it('prevents the default context menu', () => {
    renderHook(() => useDisableContextMenu())
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('stops preventing the context menu after unmount', () => {
    const { unmount } = renderHook(() => useDisableContextMenu())
    unmount()
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})
