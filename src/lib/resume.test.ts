import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openResume } from './resume'

describe('openResume', () => {
  let fakeTab: { location: { href: string }; close: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    fakeTab = { location: { href: '' }, close: vi.fn() }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens a new tab and redirects it to the resolved resume URL', async () => {
    vi.spyOn(window, 'open').mockReturnValue(fakeTab as unknown as Window)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ body: 'https://example.com/resume.pdf' }) })),
    )

    await openResume()

    expect(window.open).toHaveBeenCalledWith('', '_blank')
    expect(fakeTab.location.href).toBe('https://example.com/resume.pdf')
  })

  it('falls back to navigating the current window when the tab could not be opened', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ body: 'https://example.com/resume.pdf' }) })),
    )

    const originalLocation = window.location
    const locationStub = { href: '' }
    Object.defineProperty(window, 'location', { value: locationStub, writable: true })

    try {
      await openResume()
      expect(locationStub.href).toBe('https://example.com/resume.pdf')
    } finally {
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
    }
  })

  it('closes the opened tab when fetching the resume URL fails', async () => {
    vi.spyOn(window, 'open').mockReturnValue(fakeTab as unknown as Window)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network error')
      }),
    )

    await openResume()

    expect(fakeTab.close).toHaveBeenCalledTimes(1)
  })

  it('does not throw when both the tab is missing and the fetch fails', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network error')
      }),
    )

    await expect(openResume()).resolves.toBeUndefined()
  })
})
