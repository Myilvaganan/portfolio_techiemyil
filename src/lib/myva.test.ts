import { afterEach, describe, expect, it, vi } from 'vitest'
import { askMyva } from './myva'

describe('askMyva', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the message and history as JSON and resolves with the reply', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ reply: 'Myil has 7+ years of experience.' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const history = [{ role: 'user' as const, content: 'Hi' }]
    await expect(askMyva('How much experience does Myil have?', history)).resolves.toBe(
      'Myil has 7+ years of experience.',
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({
      message: 'How much experience does Myil have?',
      history,
    })
  })

  it('throws the server-provided error message when the API reports failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: 'MYVA is temporarily unavailable.' }),
      })),
    )

    await expect(askMyva('hello')).rejects.toThrow('MYVA is temporarily unavailable.')
  })

  it('throws a generic error when the response is not ok and has no body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => {
          throw new Error('not json')
        },
      })),
    )

    await expect(askMyva('hello')).rejects.toThrow('MYVA is unavailable right now.')
  })

  it('throws a generic error when ok is true but reply is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({}),
      })),
    )

    await expect(askMyva('hello')).rejects.toThrow('MYVA is unavailable right now.')
  })
})
