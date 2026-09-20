import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { aiContext, emptyStatements, fingerprint, type AiInsights, type Options, type StatementKind, type StatementsData } from '@/lib/statements'
import { askAi, deleteStatement, fetchStatements, generateInsights, statementFileUrl } from '@/lib/statementsApi'

// `autoInsights` can be switched off (e.g. while files are still uploading) so the analysis runs once after the last one.
export function useStatements(kind: StatementKind, options: Options = {}, autoInsights = true) {
  const [data, setData] = useState<StatementsData>(emptyStatements)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [insights, setInsights] = useState<AiInsights | null>(null)
  const [insightsBusy, setInsightsBusy] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const attempted = useRef<string>('')

  const print = useMemo(() => fingerprint(data.transactions), [data.transactions])

  const reload = useCallback(async () => {
    try {
      const next = await fetchStatements(kind)
      setData(next)
      setInsights(next.insights)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [kind])

  useEffect(() => {
    void reload()
  }, [reload])

  const generate = useCallback(async () => {
    if (!data.transactions.length) return
    setInsightsBusy(true)
    setInsightsError(null)
    try {
      setInsights(await generateInsights(kind, aiContext(kind, data, options), print))
    } catch (e) {
      setInsightsError((e as Error).message)
    } finally {
      setInsightsBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, data, print, options.excludeTransfers])

  // Insights are generated once per change to the data, then stored and simply reloaded on the next visit.
  const stale = !insights || insights.fingerprint !== print
  useEffect(() => {
    if (!autoInsights || loading || !data.transactions.length || !stale || insightsBusy || attempted.current === print) return
    attempted.current = print
    void generate()
  }, [autoInsights, loading, data.transactions.length, stale, insightsBusy, print, generate])

  const ask = useCallback((question: string) => askAi(kind, question, aiContext(kind, data, options)), [kind, data, options])

  const remove = useCallback(
    async (id: string) => {
      await deleteStatement(kind, id)
      await reload()
    },
    [kind, reload],
  )

  const openFile = useCallback(async (id: string) => {
    window.open(await statementFileUrl(kind, id), '_blank', 'noopener')
  }, [kind])

  return { data, loading, error, reload, insights: stale ? null : insights, staleInsights: stale ? insights : null, insightsBusy, insightsError, generate, ask, remove, openFile }
}
