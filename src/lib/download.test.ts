import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadWithUrl(url: string | undefined) {
  vi.resetModules()
  vi.stubEnv('VITE_DOWNLOAD_API_URL', url ?? '')
  return import('./download')
}

describe('notifyResumeDownload', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('posts the visitor details as JSON', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const { notifyResumeDownload } = await loadWithUrl('https://api.example.com/download')

    notifyResumeDownload({ name: 'Jane', email: 'jane@acme.com', reason: 'Recruiter / HR — hiring for a role' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/download')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Jane',
      email: 'jane@acme.com',
      reason: 'Recruiter / HR — hiring for a role',
    })
  })

  it('does nothing when the API URL is not configured', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { notifyResumeDownload } = await loadWithUrl(undefined)

    notifyResumeDownload({ name: 'Jane' })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not throw when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('network error'))))
    const { notifyResumeDownload } = await loadWithUrl('https://api.example.com/download')

    expect(() => notifyResumeDownload({ name: 'Jane' })).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
  })
})
