import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGithubStats } from './github'

const PROFILE = { public_repos: 42, followers: 7, created_at: '2018-01-01T00:00:00Z' }
const REPOS = [
  { fork: false, language: 'TypeScript', stargazers_count: 10 },
  { fork: false, language: 'TypeScript', stargazers_count: 5 },
  { fork: false, language: 'JavaScript', stargazers_count: 2 },
  { fork: true, language: 'TypeScript', stargazers_count: 100 }, // forks are excluded
  { fork: false, language: null, stargazers_count: 3 }, // no language, excluded from language stats
]

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response
}

describe('getGithubStats', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('fetches profile and repos, and computes aggregated stats', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/repos')) return jsonResponse(REPOS)
      return jsonResponse(PROFILE)
    })
    vi.stubGlobal('fetch', fetchMock)

    const stats = await getGithubStats()

    expect(stats.publicRepos).toBe(42)
    expect(stats.followers).toBe(7)
    // stars: summed across every repo, forks included -> 10 + 5 + 2 + 100 + 3 = 120
    expect(stats.totalStars).toBe(120)
    // years active: created 2018-01-01, "now" 2024-01-01 is 2191 days,
    // just short of 6 * 365.25 (2191.5), so it floors to 5.
    expect(stats.yearsActive).toBe(5)
    // languages: TypeScript (2 non-fork) + JavaScript (1) => TS 67%, JS 33%
    expect(stats.topLanguages).toEqual([
      { name: 'TypeScript', percent: 67 },
      { name: 'JavaScript', percent: 33 },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('caches results and serves subsequent calls from cache without refetching', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/repos')) return jsonResponse(REPOS)
      return jsonResponse(PROFILE)
    })
    vi.stubGlobal('fetch', fetchMock)

    await getGithubStats()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const second = await getGithubStats()
    expect(fetchMock).toHaveBeenCalledTimes(2) // no additional calls
    expect(second.publicRepos).toBe(42)
  })

  it('refetches once the cache TTL has expired', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/repos')) return jsonResponse(REPOS)
      return jsonResponse(PROFILE)
    })
    vi.stubGlobal('fetch', fetchMock)

    await getGithubStats()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // advance beyond the 6-hour cache TTL
    vi.setSystemTime(new Date('2024-01-01T07:00:00Z'))

    await getGithubStats()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('propagates an error when the GitHub API responds with a failure status', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, false))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getGithubStats()).rejects.toThrow('GitHub API request failed: 500')
  })

  it('ignores a malformed cache entry and fetches fresh data', async () => {
    localStorage.setItem('github-stats-cache-v1', 'not-json')
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/repos')) return jsonResponse(REPOS)
      return jsonResponse(PROFILE)
    })
    vi.stubGlobal('fetch', fetchMock)

    const stats = await getGithubStats()
    expect(stats.publicRepos).toBe(42)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
