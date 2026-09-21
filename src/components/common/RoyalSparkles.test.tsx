import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '@/hooks/useTheme'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { RoyalSparkles } from './RoyalSparkles'

function setup() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
      <RoyalSparkles />
    </ThemeProvider>,
  )
}

describe('royal theme', () => {
  beforeEach(() => {
    localStorage.clear()
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  })

  it('only shows the sparkles in the royal theme, reached by cycling the toggle', () => {
    localStorage.setItem('theme_v2', 'dark')
    setup()
    expect(screen.queryByTestId('royal-sparkles')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /switch to light theme/i }))
    expect(screen.queryByTestId('royal-sparkles')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /switch to royal theme/i }))
    expect(screen.getByTestId('royal-sparkles')).toBeInTheDocument()
    expect(document.documentElement.getAttribute('data-theme')).toBe('royal')

    fireEvent.click(screen.getByRole('button', { name: /switch to dark theme/i }))
    expect(screen.queryByTestId('royal-sparkles')).toBeNull()
  })

  it('throws a burst of stars where you click, then clears them', () => {
    vi.useFakeTimers()
    localStorage.setItem('theme_v2', 'royal')
    const { container } = setup()
    expect(container.querySelectorAll('.royal-star').length).toBeGreaterThan(10)
    fireEvent.pointerDown(window, { clientX: 100, clientY: 120 })
    expect(container.querySelectorAll('.royal-burst')).toHaveLength(8)
    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(container.querySelectorAll('.royal-burst')).toHaveLength(0)
    vi.useRealTimers()
  })
})
