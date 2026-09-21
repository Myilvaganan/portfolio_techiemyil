import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ThemeProvider, useTheme } from './useTheme'

function mockMatchMedia(prefersLight: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: prefersLight,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
}

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.head.querySelector('meta[name="theme-color"]')?.remove()
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
    mockMatchMedia(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when used outside of a ThemeProvider', () => {
    expect(() => renderHook(() => useTheme())).toThrow('useTheme must be used within a ThemeProvider')
  })

  it('defaults to royal when nothing is stored, whatever the system prefers', () => {
    for (const prefersLight of [false, true]) {
      mockMatchMedia(prefersLight)
      const { result, unmount } = renderHook(() => useTheme(), { wrapper })
      expect(result.current.theme).toBe('royal')
      expect(document.documentElement.getAttribute('data-theme')).toBe('royal')
      unmount()
    }
  })

  it('ignores the old un-versioned theme value', () => {
    localStorage.setItem('theme', 'dark')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('royal')
  })

  it('prefers a stored theme over the system preference', () => {
    localStorage.setItem('theme_v2', 'light')
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('light')
  })

  it('toggles the theme and persists the change', () => {
    localStorage.setItem('theme_v2', 'dark')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('dark')

    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('light')
    expect(localStorage.getItem('theme_v2')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('dark')
    expect(localStorage.getItem('theme_v2')).toBe('dark')
  })

  it('accepts a stored royal theme and cycles dark → light → royal → dark', () => {
    localStorage.setItem('theme_v2', 'royal')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('royal')
    expect(document.documentElement.getAttribute('data-theme')).toBe('royal')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0a0612')

    act(() => result.current.cycleTheme())
    expect(result.current.theme).toBe('dark')
    act(() => result.current.cycleTheme())
    expect(result.current.theme).toBe('light')
    act(() => result.current.cycleTheme())
    expect(result.current.theme).toBe('royal')
    expect(localStorage.getItem('theme_v2')).toBe('royal')
  })

  it('can jump straight to a theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.setTheme('royal'))
    expect(result.current.theme).toBe('royal')
  })

  it('updates the theme-color meta tag when the theme changes', () => {
    localStorage.setItem('theme_v2', 'dark')
    const { result } = renderHook(() => useTheme(), { wrapper })
    const meta = () => document.querySelector('meta[name="theme-color"]')
    expect(meta()?.getAttribute('content')).toBe('#090909')

    act(() => result.current.toggleTheme())
    expect(meta()?.getAttribute('content')).toBe('#f7f8fa')
  })
})
