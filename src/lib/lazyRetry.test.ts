import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { retryImport } from './lazyRetry'

describe('retryImport', () => {
  const reload = vi.fn()
  beforeEach(() => {
    sessionStorage.clear()
    reload.mockClear()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } })
  })
  afterEach(() => vi.restoreAllMocks())

  it('passes a good import straight through', async () => {
    await expect(retryImport(async () => 'ok')).resolves.toBe('ok')
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads once when a page file is missing, then lets the error through instead of looping', async () => {
    const bad = async () => {
      throw new Error('Failed to fetch dynamically imported module')
    }
    void retryImport(bad)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    await expect(retryImport(bad)).rejects.toThrow(/Failed to fetch/)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
