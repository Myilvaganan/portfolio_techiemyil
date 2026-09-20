import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearStoredFills, fetchStoredBrokers, fetchStoredFills, saveFills } from './optionsStore'
import { demoFills } from './optionsDemo'

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response

describe('optionsStore', () => {
  beforeEach(() => localStorage.setItem('admin_vault_token', 't') || localStorage.setItem('admin_vault_token_expires', String(Date.now() + 1e6)))
  afterEach(() => vi.unstubAllGlobals())

  it('loads trades with the admin token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { fills: [{ id: '1' }] }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchStoredFills('dhan')).toEqual([{ id: '1' }])
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/admin\/options\/fills\?broker=dhan$/)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer t')
  })

  it('lists brokers that have saved trades', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { brokers: [{ broker: 'zerodha', size: 5 }, { broker: 'dhan', size: 9 }] })))
    expect(await fetchStoredBrokers()).toEqual(['zerodha', 'dhan'])
  })

  it('uploads in chunks of 5000 and totals the result', async () => {
    const many = Array.from({ length: 12000 }, (_, i) => ({ ...demoFills()[0], id: `id${i}` }))
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { added: 5000, total: 5000 }))
      .mockResolvedValueOnce(json(200, { added: 5000, total: 10000 }))
      .mockResolvedValueOnce(json(200, { added: 2000, total: 12000 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await saveFills('groww', many)).toEqual({ added: 12000, total: 12000 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).fills).toHaveLength(2000)
  })

  it('surfaces server errors and supports clearing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(413, { error: 'Trade history is too large to store.' })))
    await expect(saveFills('dhan', demoFills().slice(0, 3))).rejects.toThrow('too large')
    const del = vi.fn().mockResolvedValue(json(200, { ok: true }))
    vi.stubGlobal('fetch', del)
    await clearStoredFills('icici')
    expect(del.mock.calls[0][1].method).toBe('DELETE')
    expect(del.mock.calls[0][0]).toMatch(/broker=icici$/)
  })
})
