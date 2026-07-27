const USERNAME = 'Myilvaganan'
const CACHE_KEY = 'github-stats-cache-v1'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

export interface LanguageStat {
  name: string
  percent: number
}

export interface GithubStats {
  publicRepos: number
  followers: number
  totalStars: number
  yearsActive: number
  topLanguages: LanguageStat[]
}

interface GithubRepo {
  fork: boolean
  language: string | null
  stargazers_count: number
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub API request failed: ${res.status}`)
  return res.json() as Promise<T>
}

function computeStats(
  profile: { public_repos: number; followers: number; created_at: string },
  repos: GithubRepo[],
): GithubStats {
  const totalStars = repos.reduce((sum, r) => sum + r.stargazers_count, 0)

  const languageCounts = new Map<string, number>()
  for (const repo of repos) {
    if (repo.fork || !repo.language) continue
    languageCounts.set(repo.language, (languageCounts.get(repo.language) ?? 0) + 1)
  }
  const totalCounted = [...languageCounts.values()].reduce((a, b) => a + b, 0)
  const topLanguages = [...languageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, percent: Math.round((count / totalCounted) * 100) }))

  const createdAt = new Date(profile.created_at)
  const yearsActive = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / (365.25 * 24 * 60 * 60 * 1000)))

  return {
    publicRepos: profile.public_repos,
    followers: profile.followers,
    totalStars,
    yearsActive,
    topLanguages,
  }
}

export async function getGithubStats(): Promise<GithubStats> {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const { data, fetchedAt } = JSON.parse(cached) as { data: GithubStats; fetchedAt: number }
      if (Date.now() - fetchedAt < CACHE_TTL_MS) return data
    }
  } catch {
    // ignore malformed cache
  }

  const [profile, repos] = await Promise.all([
    fetchJson<{ public_repos: number; followers: number; created_at: string }>(
      `https://api.github.com/users/${USERNAME}`,
    ),
    fetchJson<GithubRepo[]>(`https://api.github.com/users/${USERNAME}/repos?per_page=100`),
  ])

  const data = computeStats(profile, repos)

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() }))
  } catch {
    // storage full/unavailable — non-fatal
  }

  return data
}
