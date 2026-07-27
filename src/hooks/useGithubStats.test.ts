import { describe, expect, it, vi } from 'vitest'
import { waitFor, renderHook } from '@testing-library/react'
import { useGithubStats } from './useGithubStats'
import { getGithubStats, type GithubStats } from '@/lib/github'

vi.mock('@/lib/github', () => ({
  getGithubStats: vi.fn(),
}))

const STATS: GithubStats = {
  publicRepos: 10,
  followers: 3,
  totalStars: 20,
  yearsActive: 5,
  topLanguages: [{ name: 'TypeScript', percent: 100 }],
}

describe('useGithubStats', () => {
  it('starts in the loading state', () => {
    vi.mocked(getGithubStats).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useGithubStats())
    expect(result.current).toEqual({ data: null, status: 'loading' })
  })

  it('transitions to success with the fetched data', async () => {
    vi.mocked(getGithubStats).mockResolvedValue(STATS)
    const { result } = renderHook(() => useGithubStats())

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toEqual(STATS)
  })

  it('transitions to error when the fetch rejects', async () => {
    vi.mocked(getGithubStats).mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useGithubStats())

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.data).toBeNull()
  })

  it('does not update state after unmount', async () => {
    let resolveFn: (value: GithubStats) => void = () => {}
    vi.mocked(getGithubStats).mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve
      }),
    )

    const { result, unmount } = renderHook(() => useGithubStats())
    unmount()
    resolveFn(STATS)

    // give the microtask queue a chance to run; state should remain unchanged
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current).toEqual({ data: null, status: 'loading' })
  })
})
