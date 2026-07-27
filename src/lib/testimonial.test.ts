import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitTestimonial } from './testimonial'

const PAYLOAD = {
  name: 'Jane Doe',
  role: 'Engineering Manager',
  relationship: 'Manager',
  testimonial: 'Great to work with.',
}

describe('submitTestimonial', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the payload as JSON and resolves on success', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(submitTestimonial(PAYLOAD)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/testimonial$/)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual(PAYLOAD)
  })

  it('throws the server-provided error message when the API reports failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: false, error: 'Validation failed' }),
      })),
    )

    await expect(submitTestimonial(PAYLOAD)).rejects.toThrow('Validation failed')
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

    await expect(submitTestimonial(PAYLOAD)).rejects.toThrow('Failed to send testimonial.')
  })

  it('throws a generic error when ok is false even if success is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({}),
      })),
    )

    await expect(submitTestimonial(PAYLOAD)).rejects.toThrow('Failed to send testimonial.')
  })
})
