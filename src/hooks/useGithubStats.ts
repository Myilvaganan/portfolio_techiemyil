import { useEffect, useState } from 'react'
import { getGithubStats, type GithubStats } from '@/lib/github'

interface State {
  data: GithubStats | null
  status: 'loading' | 'success' | 'error'
}

export function useGithubStats() {
  const [state, setState] = useState<State>({ data: null, status: 'loading' })

  useEffect(() => {
    let cancelled = false

    getGithubStats()
      .then((data) => {
        if (!cancelled) setState({ data, status: 'success' })
      })
      .catch(() => {
        if (!cancelled) setState({ data: null, status: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
