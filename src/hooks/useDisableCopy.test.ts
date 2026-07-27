import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDisableCopy } from './useDisableCopy'

function dispatchCopy() {
  const event = new Event('copy', { bubbles: true, cancelable: true })
  document.dispatchEvent(event)
  return event
}

function dispatchKeydown(key: string, target: EventTarget = document) {
  const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

describe('useDisableCopy', () => {
  it('prevents copy events outside editable elements', () => {
    renderHook(() => useDisableCopy())
    const event = dispatchCopy()
    expect(event.defaultPrevented).toBe(true)
  })

  it('prevents Ctrl/Cmd+C outside editable elements', () => {
    renderHook(() => useDisableCopy())
    const event = dispatchKeydown('c')
    expect(event.defaultPrevented).toBe(true)
  })

  it('allows copy inside an input field', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    renderHook(() => useDisableCopy())

    const event = new Event('copy', { bubbles: true, cancelable: true })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)

    document.body.removeChild(input)
  })

  it('stops intercepting after unmount', () => {
    const { unmount } = renderHook(() => useDisableCopy())
    unmount()
    const event = dispatchCopy()
    expect(event.defaultPrevented).toBe(false)
  })
})
